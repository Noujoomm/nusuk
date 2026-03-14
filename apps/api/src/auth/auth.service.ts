import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { MailService } from '../common/mail.service';

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
    private mail: MailService,
  ) {}

  async validateUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
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

  async getPublicTracks() {
    return this.prisma.track.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nameAr: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async register(dto: { email: string; password: string; name: string; nameAr: string; trackId: string; role: string }) {
    const ALLOWED_ROLES = ['employee', 'track_lead', 'hr'];
    if (!ALLOWED_ROLES.includes(dto.role)) {
      throw new ConflictException('الدور غير مسموح به للتسجيل الذاتي');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');

    const track = await this.prisma.track.findUnique({ where: { id: dto.trackId } });
    if (!track || !track.isActive) {
      throw new ConflictException('المسار غير موجود أو غير فعال');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const defaultPermissions = dto.role === 'track_lead'
      ? ['view', 'edit', 'create']
      : ['view'];

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: dto.name,
          nameAr: dto.nameAr,
          passwordHash,
          role: dto.role as any,
          isActive: true,
        },
      });

      await tx.trackPermission.create({
        data: {
          userId: newUser.id,
          trackId: dto.trackId,
          permissions: defaultPermissions,
        },
      });

      return tx.user.findUnique({
        where: { id: newUser.id },
        include: { trackPermissions: { include: { track: true } } },
      });
    });

    const tokens = await this.generateTokens(user!.id, user!.email, user!.role);

    await this.prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`New user registered: ${user!.email} [${dto.role}] on track ${track.name}`);
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

  // ─── Forgot / Reset Password ───

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always return silently to prevent email enumeration
    if (!user || !user.isActive) {
      this.logger.log(`Password reset requested for unknown/inactive email: ${normalizedEmail}`);
      return;
    }

    // Generate cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    // Store hashed token with 30-minute expiry
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    // Build reset link
    const frontendUrl = this.config.get<string>('FRONTEND_URL')
      || this.config.get<string>('CORS_ORIGINS')?.split(',')[0]
      || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Send email in background (fire-and-forget — never blocks response)
    this.mail.sendPasswordResetEmail(normalizedEmail, resetLink).catch(() => {});

    this.logger.log(`Password reset token generated for: ${normalizedEmail}`);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('رابط إعادة التعيين غير صالح أو انتهت صلاحيته');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        // Unlock account if it was locked
        isLocked: false,
        failedLoginAttempts: 0,
        lockedAt: null,
      },
    });

    // Revoke all existing refresh tokens for security
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revoked: false },
      data: { revoked: true },
    });

    this.logger.log(`Password reset completed for: ${user.email}`);
  }

  async validateResetToken(rawToken: string): Promise<boolean> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    return !!user;
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
