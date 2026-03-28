import { IsString, IsInt, IsDateString, Min, Max } from 'class-validator';

export class CreateDistributionEntryDto {
  @IsDateString()
  gregorianDate: string;

  @IsString()
  hijriDate: string;

  @IsInt()
  @Min(0)
  companies: number;

  @IsInt()
  @Min(0)
  batches: number;

  @IsInt()
  @Min(0)
  @Max(4000, { message: 'لا يمكن أن يتجاوز عدد بطاقات التوزيع في الساعة 4000' })
  cardsPerHour: number;

  @IsInt()
  @Min(0)
  platformActual: number;

  @IsInt()
  @Min(0)
  factoryActual: number;

  @IsInt()
  @Min(0)
  distributionActual: number;
}
