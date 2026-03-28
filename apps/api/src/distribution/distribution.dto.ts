import { IsString, IsInt, IsDateString, Min, IsOptional } from 'class-validator';

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
  fullDeliveryCount: number;

  @IsInt() @Min(0)
  scheduledAppointments: number;

  @IsInt() @Min(0)
  actualAppointments: number;

  @IsInt() @Min(0)
  sortingTime: number;

  @IsOptional() @IsInt() @Min(0)
  expectedSortingTime?: number;

  @IsOptional() @IsInt() @Min(0)
  systemDowntime?: number;
}
