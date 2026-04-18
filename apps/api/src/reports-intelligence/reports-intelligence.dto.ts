import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum OutputMode {
  executive_summary = 'executive_summary',
  detailed = 'detailed',
  track_by_track = 'track_by_track',
  template_prep = 'template_prep',
  custom = 'custom',
}

export class CreateIntelligenceSessionDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) trackIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) reportTypes?: string[];
  @IsOptional() @IsBoolean() excludeEmpty?: boolean;
  @IsEnum(OutputMode) outputMode: OutputMode;
  @IsOptional() @IsString() @MaxLength(4000) customInstructions?: string;
  @IsOptional() @IsString() templateId?: string;
}

export class UpdateIntelligenceSessionDto {
  // JSON shape: { sections: [{ key, titleAr, body }, ...] }
  @IsOptional() editedContent?: any;
}

export class RegenerateDto {
  /**
   * Section key to regenerate (e.g. "executive_summary", "key_achievements").
   * Omit to regenerate the entire document.
   */
  @IsOptional() @IsString() section?: string;
}
