import {
  Controller,
  Delete,
  Get,
  Header,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, CurrentUser } from '../../common';
import { AccountService } from './account.service';

/**
 * Self-service GDPR endpoints (script 17). JWT-guarded and always scoped to the
 * caller via `@CurrentUser('userId')` — there is no id in the path, so a user
 * can only ever export or delete *their own* account.
 */
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** Downloadable JSON of the caller's personal data (Right to Access). */
  @Get('data-export')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="my-data-export.json"')
  exportData(@CurrentUser('userId') userId: number) {
    return this.account.exportData(userId);
  }

  /** Schedule deletion with a 30-day grace window (Right to Erasure). */
  @Delete()
  requestDeletion(@CurrentUser('userId') userId: number) {
    return this.account.requestDeletion(userId);
  }

  /** Cancel a pending deletion while still inside the grace window. */
  @Post('cancel-deletion')
  cancelDeletion(@CurrentUser('userId') userId: number) {
    return this.account.cancelDeletion(userId);
  }
}
