import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Accept JWT from Authorization header OR ?token= query param (for file downloads)
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.query?.token || null,
      ]),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  /**
   * No DB call — use JWT claims directly.
   * User data was embedded at login/refresh time.
   * If user is deactivated, token will expire or be revoked via refresh flow.
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException('جلسة غير صالحة');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      trackPermissions: (payload.tp || []).map((p) => ({
        trackId: p.trackId,
        permissions: p.permissions,
      })),
    };
  }
}
