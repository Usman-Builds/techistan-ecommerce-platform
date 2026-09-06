import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like {@link JwtAuthGuard} but never rejects: if a valid JWT cookie/bearer is
 * present, `req.user` is populated; otherwise the request continues as a guest
 * (`req.user` stays undefined). Used by endpoints that behave differently for
 * signed-in customers vs. anonymous visitors — e.g. recently-viewed (script 08),
 * which persists per-account for customers and per-cookie for guests.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Passport still runs the 'jwt' strategy; we just swallow the "no/invalid
  // token" outcome instead of throwing a 401.
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser | undefined {
    return user || undefined;
  }

  // Ensure canActivate resolves truthy even when authentication fails.
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      /* guest — ignore */
    }
    return true;
  }
}
