import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateUserDto, UpdateUserDto, SetPermissionsDto, ResetPasswordDto } from './users.dto';
import { parsePage, parseLimit } from '../common/utils/pagination.util';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.users.findAll(parsePage(page), parseLimit(pageSize), search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.password);
  }

  @Patch(':id/toggle-lock')
  toggleLock(@Param('id') id: string) {
    return this.users.toggleLock(id);
  }

  @Post(':id/permissions')
  setPermissions(@Param('id') id: string, @Body() dto: SetPermissionsDto) {
    return this.users.setPermissions(id, dto.trackId, dto.permissions);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.users.delete(id);
  }
}
