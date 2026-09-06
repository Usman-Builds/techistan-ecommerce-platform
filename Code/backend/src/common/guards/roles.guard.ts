import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces `@Roles()` metadata (NFR-208: RBAC at the API layer, not just in the
 * client UI). Must run AFTER `JwtAuthGuard` so `request.user` (with `role` from
 * the access-token payload) is populated:
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(Role.ADMIN)
 *
 * Opt-in by design: a handler with no `@Roles()` metadata is allowed through, so
 * this guard is safe to leave off public/storefront routes. Do NOT register it
 * as a global APP_GUARD unless every route declares roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No roles declared → guard is a no-op (route stays open).
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: Role } }>();
    const role = request.user?.role;

    if (!role) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // SUPER_ADMIN is a superset — it satisfies any role requirement.
    if (role === Role.SUPER_ADMIN) return true;
    if (required.includes(role)) return true;

    throw new ForbiddenException('Insufficient permissions');
  }
}
