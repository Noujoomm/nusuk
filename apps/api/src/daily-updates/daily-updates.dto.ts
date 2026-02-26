import { IsString, IsOptional, IsBoolean, MinLength, IsIn, IsInt, Min, Max, IsArray } from 'class-validator';

export class CreateDailyUpdateDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  titleAr: string;

  @IsString()
  @MinLength(2)
  content: string;

  @IsOptional()
  @IsString()
  contentAr?: string;

  @IsOptional()
  @IsString()
  @IsIn(['global', 'track', 'department'])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['completed', 'in_progress', 'delayed', 'rejected'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['normal', 'important', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsArray()
  attachments?: any[];
}

export class UpdateDailyUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  titleAr?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  contentAr?: string;

  @IsOptional()
  @IsString()
  @IsIn(['global', 'track', 'department'])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['completed', 'in_progress', 'delayed', 'rejected'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['normal', 'important', 'urgent'])
  priority?: string;

  @IsOptional()
  @IsArray()
  attachments?: any[];
}
