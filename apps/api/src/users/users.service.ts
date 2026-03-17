import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { buildSkipTake } from '../common/utils/pagination.util';

const USER_SELECT = {
  id: true, email: true, name: true, nameAr: true,
  role: true, isActive: true, createdAt: true,
  lastLoginAt: true, loginCount: true,
  failedLoginAttempts: true, isLocked: true, lockedAt: true,
  trackPermissions: {
    select: {
      trackId: true, permissions: true,
      track: { select: { name: true, nameAr: true } },
    },
  },
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, pageSize: number, search?: string) {
    const { skip, take } = buildSkipTake(page, pageSize);
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameAr: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async create(dto: CreateUserDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { password, email, ...rest } = dto;

    return this.prisma.user.create({
      data: { ...rest, email: normalizedEmail, passwordHash, role: dto.role as any },
      select: USER_SELECT,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    const data: any = { ...dto };
    if (data.email) data.email = data.email.toLowerCase().trim();
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  async resetPassword(id: string, password: string) {
    await this.findById(id);
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async toggleLock(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const newLocked = !user.isLocked;
    return this.prisma.user.update({
      where: { id },
      data: {
        isLocked: newLocked,
        lockedAt: newLocked ? new Date() : null,
        failedLoginAttempts: newLocked ? user.failedLoginAttempts : 0,
      },
      select: USER_SELECT,
    });
  }

  async setPermissions(userId: string, trackId: string, permissions: string[]) {
    await this.findById(userId);
    return this.prisma.trackPermission.upsert({
      where: { userId_trackId: { userId, trackId } },
      create: { userId, trackId, permissions },
      update: { permissions },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'تم حذف المستخدم' };
  }
}
