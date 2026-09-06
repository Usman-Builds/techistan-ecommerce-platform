import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Get,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService, IssuedTokens } from './auth.service';
import { CartService } from '../cart/cart.service';
import { CART_SESSION_COOKIE } from '../cart/cart.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from './auth.constants';

// NFR-205 / FR-106: 5 attempts, then a 15-minute lockout (429).
const STRICT_THROTTLE = { default: { limit: 5, ttl: 15 * 60 * 1000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly cart: CartService,
  ) {}

  // 👤 Local register
  @Throttle(STRICT_THROTTLE)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto);
    await this.mergeGuestCart(req, res, tokens.user.id);
    return this.respondWithTokens(res, tokens);
  }

  // 🔑 Local login
  @Throttle(STRICT_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    const tokens = await this.authService.login(user);
    await this.mergeGuestCart(req, res, tokens.user.id);
    return this.respondWithTokens(res, tokens);
  }

  // 🛡️  Admin login (script 05) — reuses the same cookie/refresh machinery as
  // /auth/login, but rejects any non-admin credential server-side so a CUSTOMER
  // token can never mint an admin session even if the admin UI is bypassed
  // (NFR-208). Same 5-attempts/15-min rate limit as the other auth routes.
  //
  // TOTP extension point (FR-107, Should — NOT implemented now): a second factor
  // would slot in HERE — after validateUser succeeds and the admin role is
  // confirmed, but BEFORE issuing tokens: if `user.totpEnabled`, return a
  // "totp_required" challenge and only mint cookies once POST /auth/verify-totp
  // checks the code against `user.totpSecret`. See schema note on the User model.
  @Throttle(STRICT_THROTTLE)
  @Post('admin/login')
  @HttpCode(200)
  async adminLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (user.role === Role.CUSTOMER) {
      throw new ForbiddenException('Not an admin account');
    }
    const tokens = await this.authService.login(user);
    return this.respondWithTokens(res, tokens);
  }

  // ✉️  Email verification
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Throttle(STRICT_THROTTLE)
  @Post('resend-verification')
  @HttpCode(200)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  // 🔒 Password reset
  @Throttle(STRICT_THROTTLE)
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPassword(dto.token, dto.password);
    // Sessions were invalidated server-side; clear this browser's cookies too.
    this.clearAuthCookies(res);
    return result;
  }

  // 🔁 Refresh-token rotation
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = this.readCookie(req, REFRESH_TOKEN_COOKIE);
    const tokens = await this.authService.refresh(raw ?? '');
    return this.respondWithTokens(res, tokens);
  }

  // 👁️  Current user
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any) {
    return this.authService.getPublicUser(req.user.userId);
  }

  // 🚪 Logout — clear DB refresh token + both cookies
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = this.authService.resolveUserIdFromRefresh(
      this.readCookie(req, REFRESH_TOKEN_COOKIE),
    );
    if (userId) await this.authService.logout(userId);
    this.clearAuthCookies(res);
    return { success: true };
  }

  // ── Guest cart merge (script 09, FR-301) ────────────────────────────────────
  // After a successful auth, fold any signed guest cart cookie into the user's
  // cart (summed per variant, stock-capped) and clear the guest cookie. Safe/
  // idempotent when there is no guest cart or it is empty.
  private async mergeGuestCart(
    req: Request,
    res: Response,
    userId: number,
  ): Promise<void> {
    const signed = (
      req as Request & { signedCookies?: Record<string, unknown> }
    ).signedCookies;
    const sessionId = signed?.[CART_SESSION_COOKIE];
    if (typeof sessionId !== 'string' || sessionId.length === 0) return;

    try {
      await this.cart.mergeGuestCartIntoUser(sessionId, userId);
    } finally {
      // Always clear the guest cookie once we've attempted the adoption.
      res.clearCookie(CART_SESSION_COOKIE, this.baseCookieOptions());
    }
  }

  // ── Cookie helpers ─────────────────────────────────────────────────────────
  private respondWithTokens(res: Response, tokens: IssuedTokens) {
    this.setAuthCookies(res, tokens);
    // Return the user (and access token for bearer/tooling fallback) so the
    // client can hydrate immediately.
    return { user: tokens.user, accessToken: tokens.accessToken };
  }

  private setAuthCookies(res: Response, tokens: IssuedTokens) {
    const accessTtl = Number(this.config.get('jwt.expiresIn')) || 86400;
    const refreshTtl = Number(this.config.get('jwt.refreshExpiresIn')) || 2592000;
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...this.baseCookieOptions(),
      maxAge: accessTtl * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...this.baseCookieOptions(),
      maxAge: refreshTtl * 1000,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.baseCookieOptions());
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.baseCookieOptions());
  }

  private baseCookieOptions() {
    const isProd = this.config.get<string>('app.environment') === 'production';
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProd,
      path: '/',
    };
  }

  private readCookie(req: Request, name: string): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    return cookies?.[name];
  }
}
