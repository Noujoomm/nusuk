import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';

export enum ExecutiveTaskStatusDto {
  new = 'new',
  sent = 'sent',
  in_progress = 'in_progress',
  editing = 'editing',
  edited = 'edited',
  approved = 'approved',
  completed = 'completed',
}

export class CreateExecutiveTaskDto {
  @IsString()
  sheetName: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(ExecutiveTaskStatusDto)
  status?: ExecutiveTaskStatusDto;

  @IsOptional()
  @IsString()
  track?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  followUp?: string;

  @IsOptional()
  @IsDateString()
  receiveDate?: string;

  @IsOptional()
  @IsDateString()
  lastActionDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExecutiveTaskDto {
  @IsOptional()
  @IsString()
  sheetName?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(ExecutiveTaskStatusDto)
  status?: ExecutiveTaskStatusDto;

  @IsOptional()
  @IsString()
  track?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  followUp?: string;

  @IsOptional()
  @IsDateString()
  receiveDate?: string;

  @IsOptional()
  @IsDateString()
  lastActionDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
