import { IsString, IsInt, IsDateString, Min, Max, IsOptional, MaxLength } from 'class-validator';

export class CreateAchievementDto {
  @IsDateString() gregorianDate: string;
  @IsString() hijriDate: string;
  @IsString() @IsOptional() batch?: string;
  @IsInt() @Min(0) companies: number;
  @IsInt() @Min(0) parcels: number;
  @IsInt() @Min(0) totalCards: number;
  @IsInt() @Min(0) cardsPerHour: number;
  @IsOptional() @IsInt() @Min(1) duration?: number;
  @IsOptional() @IsInt() @Min(1) specialists?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateDeviationDto {
  @IsDateString() gregorianDate: string;
  @IsString() hijriDate: string;
  // Section 1: Inputs
  @IsInt() @Min(0) companies: number;
  @IsInt() @Min(0) platformValue: number;
  @IsInt() @Min(0) factoryValue: number;
  @IsInt() @Min(0) distributionValue: number;
  // Section 2A: Appointment 3H
  @IsOptional() @IsInt() @Min(0) totalCompanies3h?: number;
  @IsOptional() @IsInt() @Min(0) attendedCompanies3h?: number;
  // Section 2B: Completion
  @IsOptional() @IsInt() @Min(0) @Max(100) completionPct?: number;
  // Section 2C: Receiving
  @IsOptional() @IsInt() @Min(0) totalReceiving?: number;
  @IsOptional() @IsInt() @Min(0) completedReceiving?: number;
  // Section 3: System Reports
  @IsOptional() @IsInt() @Min(0) reportsPlatform?: number;
  @IsOptional() @IsInt() @Min(0) reportsApple?: number;
  @IsOptional() @IsInt() @Min(0) reportsAndroid?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
