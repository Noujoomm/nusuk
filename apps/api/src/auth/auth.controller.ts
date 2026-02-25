import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private audit: AuditService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

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

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh',
    });

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

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@CurrentUser() user: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return this.auth.getProfile(user.id);
  }
}
