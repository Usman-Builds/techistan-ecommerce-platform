import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Composed guard shortcuts so later scripts (07, 12, 15…) gate admin endpoints
 * with a single decorator instead of repeating the guard + role wiring.
 *
 * `@AdminOnly()` — allows ADMIN and SUPER_ADMIN.
 *   Equivalent to: @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN, Role.SUPER_ADMIN)
 *
 * `@SuperAdminOnly()` — allows SUPER_ADMIN only.
 *   Equivalent to: @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.SUPER_ADMIN)
 */
export const AdminOnly = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.ADMIN, Role.SUPER_ADMIN),
  );

export const SuperAdminOnly = () =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(Role.SUPER_ADMIN));
