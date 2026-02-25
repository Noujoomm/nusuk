import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { trackPermissions: { include: { track: true } } },
    });
    if (!user) throw new UnauthorizedException('بيانات الدخول غير صحيحة');

    // Check if account is locked
    if (user.isLocked) {
      const lockExpiry = user.lockedAt
        ? new Date(user.lockedAt.getTime() + LOCK_DURATION_MINUTES * 60 * 1000)
        : null;

      if (lockExpiry && lockExpiry > new Date()) {
        const minutesLeft = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
        throw new UnauthorizedException(
          `الحساب مقفل بسبب محاولات دخول خاطئة. حاول مرة أخرى بعد ${minutesLeft} دقيقة`
        );
      }

      // Lock expired, unlock
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isLocked: false, failedLoginAttempts: 0, lockedAt: null },
      });
    }

    if (!user.isActive) throw new UnauthorizedException('الحساب غير مفعل');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // Track failed attempt
      const newAttempts = (user.failedLoginAttempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          ...(shouldLock ? { isLocked: true, lockedAt: new Date() } : {}),
        },
      });

      if (shouldLock) {
        throw new UnauthorizedException(
          `تم قفل الحساب بعد ${MAX_FAILED_ATTEMPTS} محاولات خاطئة. حاول مرة أخرى بعد ${LOCK_DURATION_MINUTES} دقيقة`
        );
      }

      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    // Successful login: reset failed attempts, update login stats
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        isLocked: false,
        lockedAt: null,
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    return user;
  }

  async register(dto: { email: string; password: string; name: string; nameAr: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        nameAr: dto.nameAr,
        passwordHash,
        role: 'employee',
        isActive: true,
      },
      include: { trackPermissions: { include: { track: true } } },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`New user registered: ${user.email}`);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    this.logger.log(`User logged in: ${user.email}`);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { trackPermissions: { include: { track: true } } } } },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('جلسة منتهية، يرجى تسجيل الدخول مرة أخرى');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const tokens = await this.generateTokens(stored.user.id, stored.user.email, stored.user.role);

    // Store new refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: stored.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { ...tokens, user: this.sanitizeUser(stored.user) };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { trackPermissions: { include: { track: true } } },
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitizeUser(user);
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload);

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...rest } = user;
    return {
      ...rest,
      trackPermissions: user.trackPermissions?.map((tp: any) => ({
        trackId: tp.trackId,
        trackName: tp.track.name,
        trackNameAr: tp.track.nameAr,
        permissions: tp.permissions,
      })),
    };
  }
}
