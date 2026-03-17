import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCommentDto, UpdateCommentDto } from './comments.dto';
import { parsePage, parseLimit } from '../common/utils/pagination.util';

@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private comments: CommentsService) {}

  @Get(':entityType/:entityId')
  findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.comments.findByEntity(entityType, entityId, {
      page: parsePage(page),
      pageSize: parseLimit(pageSize),
    });
  }

  @Get(':entityType/:entityId/count')
  async countByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    const count = await this.comments.countByEntity(entityType, entityId);
    return { count };
  }

  @Post()
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: any) {
    return this.comments.create({
      entityType: dto.entityType,
      entityId: dto.entityId,
      parentId: dto.parentId,
      authorId: user.id,
      body: dto.body,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.comments.update(id, user.id, dto.body);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.comments.delete(id, user.id, user.role);
  }
}
