import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Metadata key under which required roles are stored. Read back by `RolesGuard`
 * via `Reflector`.
 */
export const ROLES_KEY = 'roles';

/**
 * Declare the roles allowed to access a controller or handler.
 *
 * Usage (roles are only enforced when `RolesGuard` also runs — see
 * `@AdminOnly()` / `@SuperAdminOnly()` in ./admin.decorators.ts):
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(Role.ADMIN)
 *   @Get('secret')
 *   ...
 *
 * `SUPER_ADMIN` is treated as a superset and satisfies any `ADMIN` requirement.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
