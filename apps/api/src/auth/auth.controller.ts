import { Controller, Post, Get, Body, Query, Req, Res, UseGuards, HttpCode, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { LoginDto, RefreshDto, RegisterDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto';

const isProduction = process.env.NODE_ENV === 'production';

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  });
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private auth: AuthService,
    private audit: AuditService,
  ) {}

  @Get('public-tracks')
  async getPublicTracks() {
    return this.auth.getPublicTracks();
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);

    setRefreshCookie(res, result.refreshToken);

    await this.audit.log({
      actorId: result.user.id,
      actionType: 'register',
      entityType: 'user',
      entityId: result.user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);

    setRefreshCookie(res, result.refreshToken);

    await this.audit.log({
      actorId: result.user.id,
      actionType: 'login',
      entityType: 'user',
      entityId: result.user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Try body first, then cookie
    const token = dto.refreshToken || req.cookies?.refresh_token;
    if (!token) throw new Error('No refresh token provided');

    const result = await this.auth.refresh(token);

    setRefreshCookie(res, result.refreshToken);

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@CurrentUser() user: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/auth',
    });

    await this.audit.log({
      actorId: user.id,
      actionType: 'logout',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { message: 'تم تسجيل الخروج بنجاح' };
  }

  // ─── Forgot / Reset Password ───

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    try {
      await this.auth.forgotPassword(dto.email);
    } catch (error) {
      // Never expose internal errors — log and continue silently
      this.logger.error('forgotPassword internal error:', error);
    }

    try {
      await this.audit.log({
        actionType: 'password_reset_request',
        entityType: 'user',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (error) {
      this.logger.error('forgotPassword audit log error:', error);
    }

    // Always return the same message to prevent email enumeration
    return {
      message: 'إذا كان البريد الإلكتروني مسجلاً لدينا فسيتم إرسال رابط إعادة تعيين كلمة المرور.',
    };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.auth.resetPassword(dto.token, dto.password);

    await this.audit.log({
      actionType: 'password_reset_complete',
      entityType: 'user',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { message: 'تم تحديث كلمة المرور بنجاح' };
  }

  @Get('validate-reset-token')
  async validateResetToken(@Query('token') token: string) {
    if (!token) return { valid: false };
    const valid = await this.auth.validateResetToken(token);
    return { valid };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return this.auth.getProfile(user.id);
  }
}
