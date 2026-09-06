import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Public store settings read (script 14, Task 11) — **no guard**. Returns only
 * the storefront-safe projection (name, currency, logo, contact, socials). The
 * admin settings editor with the full record lands in script 15.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getPublicSettings();
  }
}
