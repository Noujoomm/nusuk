import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class ExportReportDto {
  @IsString()
  @IsIn(['DOCX', 'EXCEL', 'BOTH'])
  format!: 'DOCX' | 'EXCEL' | 'BOTH';

  @IsOptional()
  @IsString()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';

  @IsOptional()
  @IsBoolean()
  includeRawData?: boolean;

  @IsOptional()
  @IsBoolean()
  includeAIInsights?: boolean;
}
