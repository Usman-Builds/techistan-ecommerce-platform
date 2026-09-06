import {
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../../common';
import type { AuthUser } from '../../common';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

/**
 * In-app notification center (script 16, FR-904). JWT-guarded but NOT role-scoped:
 * every authenticated identity — customer or admin — reads/writes ONLY its own
 * rows (the service filters by `user.userId`, NFR-208). Both the storefront and
 * the admin panel hit this identical surface; the JWT decides which rows return.
 */
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notifications.list(user.userId, {
      page: query.page,
      pageSize: query.pageSize,
      unreadOnly: query.unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.userId);
  }

  @Patch('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.userId, id);
  }
}
