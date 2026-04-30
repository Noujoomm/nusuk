import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AbsenceType } from '@prisma/client';

export class EmployeeAbsenceItemDto {
  @IsString()
  employeeId: string;

  @IsEnum(AbsenceType)
  type: AbsenceType;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.25)
  hours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkAbsenceDto {
  @IsString()
  trackId: string;

  @IsString()
  bookletId: string;

  @IsDateString()
  absenceDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmployeeAbsenceItemDto)
  employees: EmployeeAbsenceItemDto[];

  @IsOptional()
  @IsString()
  globalReason?: string;
}

export class GetEmployeesByTrackBookletDto {
  @IsString()
  trackId: string;

  @IsString()
  bookletId: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
