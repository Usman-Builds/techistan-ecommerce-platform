// Barrel export for the shared RBAC primitives so feature modules can import
// from a single place: `import { AdminOnly, RolesGuard, Roles } from 'src/common';`
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
export { RolesGuard } from './guards/roles.guard';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';
export { AdminOnly, SuperAdminOnly } from './decorators/admin.decorators';
export { CurrentUser } from './decorators/current-user.decorator';
export type { AuthUser } from './decorators/current-user.decorator';
export { slugify, ensureUniqueSlug } from './utils/slug.util';
export { formatMoney } from './utils/money.util';
