import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  password: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class RegisterDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'الاسم يجب أن يكون حرفين على الأقل' })
  name: string;

  @IsString()
  @MinLength(2, { message: 'الاسم بالعربي يجب أن يكون حرفين على الأقل' })
  nameAr: string;

  @IsString({ message: 'يجب اختيار المسار' })
  trackId: string;

  @IsIn(['employee', 'track_lead', 'hr'], { message: 'الدور غير صالح' })
  role: string;
}
