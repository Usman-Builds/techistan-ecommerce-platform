import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * Admin store-settings editor (script 15, FR-810). `@AdminOnly()`. Returns/writes
 * the FULL StoreSetting record (incl. taxRules/shippingZones/threshold), unlike
 * the public `GET /settings` projection. The update is audited in the service.
 */
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getAdminSettings();
  }

  @Patch()
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.settings.updateSettings(dto, actorId);
  }
}
