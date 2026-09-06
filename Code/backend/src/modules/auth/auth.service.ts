import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  BCRYPT_COST,
  PASSWORD_RESET_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from './auth.constants';

// Shape returned to clients — never leak password/refreshToken/googleId.
export type PublicUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  provider: string;
  emailVerified: Date | null;
  profilePhoto: string | null;
  deletionScheduledAt: Date | null;
};

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  // ── Registration (local) ──────────────────────────────────────────────────
  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<IssuedTokens> {
    const hashed = await bcrypt.hash(data.password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashed,
        provider: 'LOCAL',
        role: 'CUSTOMER', // FR: new sign-ups are customers (belt-and-suspenders)
        emailVerified: null, // FR-101: must verify before login
      },
    });

    // FR-101: create a verification token and stub-send the link. Never block
    // registration on delivery.
    await this.issueVerificationEmail(user.id, user.email);

    return this.issueTokens(user);
  }

  // ── Credential validation (local) ─────────────────────────────────────────
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // FR-101: gate logins on a verified email. Rows carrying the legacy GOOGLE
    // provider are already verified,
    // implicitly by the provider.
    if (user.provider === 'LOCAL' && !user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    // A banned account (set by an admin via the customers screen, script 15) can
    // no longer authenticate. Same 403 shape regardless of transport.
    if (user.status === 'BANNED') {
      throw new ForbiddenException('This account has been suspended');
    }

    return user;
  }

  // ── Login ────────────────────────────────────────────────────────────────
  login(user: any): Promise<IssuedTokens> {
    return this.issueTokens(user);
  }

  // ── Email verification ────────────────────────────────────────────────────
  async verifyEmail(rawToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    const [verifiedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // FR-901: welcome the shopper now that their email is confirmed. Best-effort.
    void this.email.sendWelcome(verifiedUser.email, verifiedUser.firstName);

    return { success: true };
  }

  // Always returns generic success (no account enumeration).
  async resendVerification(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.provider === 'LOCAL' && !user.emailVerified) {
      await this.issueVerificationEmail(user.id, user.email);
    }
    return { success: true };
  }

  // ── Password reset ────────────────────────────────────────────────────────
  // Always returns generic success (no account enumeration).
  async forgotPassword(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(raw),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
      });
      const link = `${this.userAppUrl()}/reset-password?token=${raw}`;
      void this.email.sendPasswordReset(user.email, link);
    }
    return { success: true };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_COST);

    await this.prisma.$transaction([
      // Update password and invalidate all existing sessions (clear refresh).
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed, refreshToken: null },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  // ── Refresh-token rotation ────────────────────────────────────────────────
  async refresh(rawRefreshToken: string): Promise<IssuedTokens> {
    let payload: { sub: number };
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Compare the presented token against the stored bcrypt hash.
    const matches = await bcrypt.compare(
      this.hashToken(rawRefreshToken),
      user.refreshToken,
    );
    if (!matches) {
      // Reuse detection: a mismatching-but-signed token means the stored one was
      // already rotated. Revoke everything.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return this.issueTokens(user); // rotates + overwrites the stored hash
  }

  // ── Session teardown ──────────────────────────────────────────────────────
  async logout(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async getPublicUser(userId: number): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.toPublicUser(user);
  }

  // Resolve the user id from a refresh-token cookie without throwing — used by
  // logout so an expired access token can still tear down the session.
  resolveUserIdFromRefresh(rawRefreshToken?: string): number | null {
    if (!rawRefreshToken) return null;
    try {
      const payload = this.jwtService.verify<{ sub: number }>(rawRefreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      return payload.sub;
    } catch {
      return null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  private async issueTokens(user: any): Promise<IssuedTokens> {
    const payload = { sub: user.id, email: user.email, role: user.role };

    // Access token uses the JwtModule defaults (JWT_SECRET / JWT_EXPIRES_IN).
    const accessToken = this.jwtService.sign(payload);

    // Refresh token uses a separate secret + longer TTL.
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: Number(this.config.get('jwt.refreshExpiresIn')) || 2592000,
    });

    // Persist a bcrypt hash of the refresh token (never the raw token). We
    // sha256 first so bcrypt's 72-byte input limit can't truncate a long JWT.
    const refreshHash = await bcrypt.hash(
      this.hashToken(refreshToken),
      BCRYPT_COST,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshHash },
    });

    return { accessToken, refreshToken, user: this.toPublicUser(user) };
  }

  private async issueVerificationEmail(
    userId: number,
    email: string,
  ): Promise<void> {
    const raw = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    const link = `${this.userAppUrl()}/verify-email?token=${raw}`;
    void this.email.sendVerification(email, link);
  }

  // Deterministic hash for high-entropy tokens (allows unique-column lookup).
  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private userAppUrl(): string {
    return (
      this.config.get<string>('userAppUrl') || 'http://localhost:3001'
    ).replace(/\/$/, '');
  }

  private toPublicUser(user: any): PublicUser {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      provider: user.provider,
      emailVerified: user.emailVerified ?? null,
      profilePhoto: user.profilePhoto ?? null,
      deletionScheduledAt: user.deletionScheduledAt ?? null,
    };
  }
}
