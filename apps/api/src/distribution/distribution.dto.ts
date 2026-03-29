import { IsString, IsInt, IsDateString, Min, IsOptional } from 'class-validator';

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
}

export class CreateDeviationDto {
  @IsDateString() gregorianDate: string;
  @IsString() hijriDate: string;
  @IsInt() @Min(0) companies: number;
  @IsInt() @Min(0) parcels: number;
  @IsInt() @Min(0) platformValue: number;
  @IsInt() @Min(0) factoryValue: number;
  @IsInt() @Min(0) distributionValue: number;
  @IsInt() @Min(0) threeHourValue: number;
  @IsOptional() @IsInt() @Min(0) reportsPlatform?: number;
  @IsOptional() @IsInt() @Min(0) reportsApple?: number;
  @IsOptional() @IsInt() @Min(0) reportsAndroid?: number;
}
