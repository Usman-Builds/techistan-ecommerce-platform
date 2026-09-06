import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Shape of `request.user` as populated by `JwtStrategy.validate` (script 04/05):
 * the JWT `sub`, email, and role. Guarded handlers can read it via `@CurrentUser()`.
 */
export interface AuthUser {
  userId: number;
  email: string;
  role: Role;
}

/**
 * Param decorator for the authenticated user. Only meaningful behind a JWT guard
 * (e.g. `@AdminOnly()`) — on an unguarded route `request.user` is undefined.
 *
 *   create(@Body() dto: CreateProductDto, @CurrentUser('userId') actorId: number)
 *   me(@CurrentUser() user: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    return data ? user?.[data] : user;
  },
);
