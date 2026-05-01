import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @IsOptional()
  @IsISO8601()
  dateRangeStart?: string;

  @IsOptional()
  @IsISO8601()
  dateRangeEnd?: string;

  /** "مكة" → makkah, "المدينة" → madinah, otherwise all. */
  @IsOptional()
  @IsString()
  @IsIn(['makkah', 'madinah', 'all'])
  centerFilter?: 'makkah' | 'madinah' | 'all';

  @IsOptional()
  @IsString()
  @IsIn(['BASIC', 'COMPREHENSIVE'])
  analysisDepth?: 'BASIC' | 'COMPREHENSIVE';
}
