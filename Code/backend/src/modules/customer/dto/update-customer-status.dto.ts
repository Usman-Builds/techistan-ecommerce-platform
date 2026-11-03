import { UserStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

/**
 * Statuses an admin may set through the ban/reactivate toggle. PENDING_DELETION
 * and DELETED belong to the GDPR flow (deletion date, anonymisation) in
 * AccountService, so they are not accepted here (#26).
 */
export const TOGGLEABLE_STATUSES = [
  UserStatus.ACTIVE,
  UserStatus.BANNED,
] as const;
export type ToggleableStatus = (typeof TOGGLEABLE_STATUSES)[number];

/** Toggle a customer's account status active/banned (script 15, FR-804). */
export class UpdateCustomerStatusDto {
  @IsIn(TOGGLEABLE_STATUSES, {
    message: `status must be one of: ${TOGGLEABLE_STATUSES.join(', ')}`,
  })
  status!: ToggleableStatus;
}
