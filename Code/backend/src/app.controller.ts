import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.welcomeMessage();
  }

  // Health check for uptime monitoring (NFR-305). Unguarded.
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
