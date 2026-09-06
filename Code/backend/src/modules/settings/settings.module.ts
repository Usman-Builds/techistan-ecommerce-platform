import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { SettingsService } from './settings.service';

/**
 * Store settings (scripts 14 + 15). Exposes the public `GET /settings` projection
 * and the admin `GET/PATCH /admin/settings` editor. PrismaService + AuditService
 * are @Global; ConfigService comes from the root ConfigModule.
 */
@Module({
  controllers: [SettingsController, AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
