import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdatePreferencesDto } from './notifications.dto';
import { parsePage, parseLimit } from '../common/utils/pagination.util';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.findByUser(user.id, {
      page: parsePage(page),
      pageSize: parseLimit(pageSize),
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notifications.getUnreadCount(user.id);
    return { count };
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: any) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: any, @Body() dto: UpdatePreferencesDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: any) {
    return this.notifications.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notifications.markAsRead(id, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notifications.delete(id, user.id);
  }
}
