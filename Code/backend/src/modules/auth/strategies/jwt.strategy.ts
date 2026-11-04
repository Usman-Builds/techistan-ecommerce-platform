import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';

// Read the access token from the httpOnly cookie first, then fall back to the
// Authorization: Bearer header (tooling / API clients).
const cookieExtractor = (req: Request): string | null => {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
};

/** Statuses whose sessions are dead: a banned or erased account. */
const REVOKED_STATUSES: UserStatus[] = [UserStatus.BANNED, UserStatus.DELETED];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET') || 'default_jwt_secret';

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * A valid signature is not enough: the session behind the token must still
   * exist (#20). Ban, logout, password reset, refresh-token reuse detection and
   * account erasure all clear the stored refresh token, so a null one means the
   * session was revoked and the access token dies with it, instead of working
   * until it expires (24 h by default). The role comes from the database, so a
   * demoted admin loses admin access immediately.
   */
  async validate(payload: { sub: number; sid?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        refreshToken: true,
        // Per-device session (#22); tokens issued before it carry no sid.
        refreshSessions: payload.sid
          ? { where: { id: payload.sid }, select: { id: true } }
          : false,
      },
    });
    const sessionAlive = payload.sid
      ? (user?.refreshSessions?.length ?? 0) > 0
      : user?.refreshToken != null;
    if (!user || !sessionAlive) {
      throw new UnauthorizedException(
        'Your session has ended. Please sign in again.',
      );
    }
    if (REVOKED_STATUSES.includes(user.status)) {
      throw new UnauthorizedException('This account is not active.');
    }
    return { userId: user.id, email: user.email, role: user.role };
  }
}
