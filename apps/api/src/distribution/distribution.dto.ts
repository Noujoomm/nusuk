import { IsString, IsInt, IsNumber, IsDateString, Min, Max, IsOptional } from 'class-validator';

export class CreateAchievementDto {
  @IsDateString()
  gregorianDate: string;

  @IsString()
  hijriDate: string;

  @IsInt() @Min(0)
  companies: number;

  @IsInt() @Min(0)
  batches: number;

  @IsInt() @Min(0)
  totalCards: number;

  @IsInt() @Min(0)
  cardsPerHour: number;

  @IsOptional() @IsInt() @Min(1)
  duration?: number;

  @IsOptional() @IsInt() @Min(1)
  specialists?: number;

  @IsNumber() @Min(0)
  achievementPct: number;
}

export class CreateDeviationDto {
  @IsDateString()
  gregorianDate: string;

  @IsString()
  hijriDate: string;

  @IsInt() @Min(0)
  companies: number;

  @IsInt() @Min(0)
  platformValue: number;

  @IsInt() @Min(0)
  factoryValue: number;

  @IsInt() @Min(0)
  distributionValue: number;

  @IsInt() @Min(0)
  inValue: number;

  @IsInt() @Min(0)
  outValue: number;

  @IsNumber()
  platformDevPct: number;

  @IsNumber()
  fullReceiptDevPct: number;

  @IsNumber()
  completionCertDevPct: number;

  @IsNumber()
  booking3HourDevPct: number;
}
