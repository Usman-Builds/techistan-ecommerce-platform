import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, createHash } from 'crypto';
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

/**
 * How long a just-rotated refresh token is still accepted (#22). Two tabs, or a
 * server render and a client fetch, often refresh with the same cookie at the
 * same moment; the second must not be mistaken for a stolen token.
 */
export const REFRESH_GRACE_MS = 30_000;

type RefreshPayload = { sub: number; sid?: string };

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
  /**
   * Create a LOCAL customer and send the verification link. No session is
   * issued (#19): login is gated on a verified email (FR-101), so signing the
   * new account in here would let anyone operate an account under an address
   * they don't control. The user signs in after verifying.
   */
  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<{ user: PublicUser }> {
    const email = data.email.trim().toLowerCase();
    // Older rows may be stored mixed-case, so the unique index alone can't
    // catch "ADA@x.com" vs "ada@x.com" (#21).
    if (await this.findUserByEmail(email)) {
      throw new ConflictException('An account with this email already exists.');
    }
    const hashed = await bcrypt.hash(data.password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email,
        password: hashed,
        provider: 'LOCAL',
        role: 'CUSTOMER', // FR: new sign-ups are customers (belt-and-suspenders)
        emailVerified: null, // FR-101: must verify before login
      },
    });

    // FR-101: create a verification token and stub-send the link. Never block
    // registration on delivery.
    await this.issueVerificationEmail(user.id, user.email);

    return { user: this.toPublicUser(user) };
  }

  /**
   * Case-insensitive lookup (#21). New sign-ups are stored lowercase, but rows
   * created before that may be mixed-case and must still be found.
   */
  private findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
  }

  // ── Credential validation (local) ─────────────────────────────────────────
  async validateUser(email: string, password: string) {
    const user = await this.findUserByEmail(email);
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // FR-101: gate logins on a verified email. Rows carrying the legacy GOOGLE
    // provider are already verified,
    // implicitly by the provider.
    if (user.provider === 'LOCAL' && !user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );
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
    const user = await this.findUserByEmail(email);
    if (user && user.provider === 'LOCAL' && !user.emailVerified) {
      await this.issueVerificationEmail(user.id, user.email);
    }
    return { success: true };
  }

  // ── Password reset ────────────────────────────────────────────────────────
  // Always returns generic success (no account enumeration).
  async forgotPassword(email: string): Promise<{ success: true }> {
    const user = await this.findUserByEmail(email);
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
      this.prisma.refreshSession.deleteMany({
        where: { userId: record.userId },
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
    let payload: RefreshPayload;
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
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Same gates as login (#19): an unverified LOCAL account or a banned or
    // erased one can't keep a session alive by refreshing.
    if (
      (user.provider === 'LOCAL' && !user.emailVerified) ||
      user.status === 'BANNED' ||
      user.status === 'DELETED'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.sid) {
      return this.rotateSession(user, payload.sid, rawRefreshToken);
    }

    // A token from before per-device sessions (#22): check it against the
    // legacy single hash once, then move this device onto its own session.
    if (!user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
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
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null },
    });
    return this.issueTokens(user);
  }

  /**
   * Rotate the refresh token of one session (#22). The current token rotates;
   * the one rotated out just before is accepted for {@link REFRESH_GRACE_MS}
   * (concurrent refreshes). Anything else is a replayed, superseded token:
   * that session alone is revoked.
   */
  private async rotateSession(
    user: { id: number; email: string; role: string },
    sessionId: string,
    rawRefreshToken: string,
  ): Promise<IssuedTokens> {
    const presented = this.hashToken(rawRefreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !session ||
      session.userId !== user.id ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = this.signTokens(user, session.id);
    const next = this.hashToken(tokens.refreshToken);
    const expiresAt = this.refreshExpiry();

    if (presented === session.tokenHash) {
      // Conditional: of two concurrent rotations only one matches here.
      const { count } = await this.prisma.refreshSession.updateMany({
        where: { id: session.id, tokenHash: presented },
        data: {
          tokenHash: next,
          previousHash: presented,
          rotatedAt: new Date(),
          expiresAt,
        },
      });
      if (count === 1) return { ...tokens, user: this.toPublicUser(user) };
    }

    // The loser of a concurrent rotation, or a tab a moment behind: accept
    // the token that was rotated out within the grace window.
    const { count } = await this.prisma.refreshSession.updateMany({
      where: {
        id: session.id,
        previousHash: presented,
        rotatedAt: { gte: new Date(Date.now() - REFRESH_GRACE_MS) },
      },
      data: { tokenHash: next, expiresAt },
    });
    if (count === 1) return { ...tokens, user: this.toPublicUser(user) };

    // Reuse detection: a signed but superseded token. Revoke this session.
    await this.prisma.refreshSession.deleteMany({ where: { id: session.id } });
    throw new UnauthorizedException('Refresh token reuse detected');
  }

  // ── Session teardown ──────────────────────────────────────────────────────
  /**
   * Sign out the device whose refresh token was presented (#22). Other
   * devices stay signed in. A token from before per-device sessions clears
   * the legacy single session, as before.
   */
  async logout(rawRefreshToken?: string): Promise<void> {
    const payload = this.verifyRefresh(rawRefreshToken);
    if (!payload) return;
    if (payload.sid) {
      await this.prisma.refreshSession.deleteMany({
        where: { id: payload.sid, userId: payload.sub },
      });
      return;
    }
    await this.prisma.user.updateMany({
      where: { id: payload.sub },
      data: { refreshToken: null },
    });
  }

  async getPublicUser(userId: number): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.toPublicUser(user);
  }

  // Read a refresh-token cookie without throwing — used by logout so an
  // expired access token can still tear down the session.
  private verifyRefresh(rawRefreshToken?: string): RefreshPayload | null {
    if (!rawRefreshToken) return null;
    try {
      return this.jwtService.verify<RefreshPayload>(rawRefreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      return null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  /** Start a new session (one per sign-in, #22) and issue its tokens. */
  private async issueTokens(user: any): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const tokens = this.signTokens(user, sessionId);
    // Sweep this user's expired sessions so the table doesn't grow unbounded.
    await this.prisma.refreshSession.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });
    // Only a hash of the refresh token is stored, never the raw token.
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: this.refreshExpiry(),
      },
    });
    return { ...tokens, user: this.toPublicUser(user) };
  }

  /**
   * Sign an access + refresh pair for a session. `sid` ties both to the
   * session, so ending it also ends its access token (see JwtStrategy). A
   * random `jti` keeps two tokens signed in the same second distinct.
   */
  private signTokens(
    user: { id: number; email: string; role: string },
    sessionId: string,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
    };
    // Access token uses the JwtModule defaults (JWT_SECRET / JWT_EXPIRES_IN).
    const accessToken = this.jwtService.sign(payload);
    // Refresh token uses a separate secret + longer TTL.
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.refreshTtlSeconds(),
      jwtid: randomUUID(),
    });
    return { accessToken, refreshToken };
  }

  private refreshTtlSeconds(): number {
    return Number(this.config.get('jwt.refreshExpiresIn')) || 2592000;
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlSeconds() * 1000);
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
