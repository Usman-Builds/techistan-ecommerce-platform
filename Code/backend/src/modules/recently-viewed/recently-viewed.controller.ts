import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, OptionalJwtAuthGuard } from '../../common';
import { RecentlyViewedService } from './recently-viewed.service';
import { RecordViewDto } from './dto/record-view.dto';
import {
  parseRvCookie,
  pushRvCookie,
  RV_COOKIE,
  RV_COOKIE_MAX_AGE,
} from './recently-viewed.constants';

/**
 * Recently-viewed endpoints (FR-224). `OptionalJwtAuthGuard` populates
 * `req.user` when a valid session exists but never rejects, so the same routes
 * serve customers (server-persisted) and guests (cookie). The guest cookie is
 * intentionally non-httpOnly — it holds only public product ids.
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('recently-viewed')
export class RecentlyViewedController {
  constructor(private readonly rv: RecentlyViewedService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request & { cookies?: Record<string, string> },
  ) {
    if (user) return this.rv.listForUser(user.userId);
    return this.rv.listForIds(parseRvCookie(req.cookies?.[RV_COOKIE]));
  }

  @Post()
  async record(
    @Body() dto: RecordViewDto,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rv.assertViewable(dto.productId);

    if (user) {
      await this.rv.recordForUser(user.userId, dto.productId);
      return { ok: true };
    }

    const next = pushRvCookie(
      parseRvCookie(req.cookies?.[RV_COOKIE]),
      dto.productId,
    );
    res.cookie(RV_COOKIE, JSON.stringify(next), {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: RV_COOKIE_MAX_AGE,
    });
    return { ok: true };
  }
}
