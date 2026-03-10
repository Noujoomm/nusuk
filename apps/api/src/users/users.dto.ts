import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(2, { message: 'الاسم يجب أن يكون حرفين على الأقل' })
  name: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  password: string;

  @IsEnum(['admin', 'pm', 'track_lead', 'employee', 'hr'], { message: 'الدور غير صالح' })
  role: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsEnum(['admin', 'pm', 'track_lead', 'employee', 'hr'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetPermissionsDto {
  @IsString()
  trackId: string;

  @IsArray()
  @IsString({ each: true })
  permissions: string[]; // ['view','edit','create','delete','export']
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  password: string;
}
