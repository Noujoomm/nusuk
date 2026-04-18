import { IsString, IsOptional, IsBoolean, IsInt, IsObject, IsNumber, MinLength } from 'class-validator';

export class CreateTrackDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsObject()
  fieldSchema?: any;
}

export class UpdateTrackDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  fieldSchema?: any;
}

// ─── EMPLOYEE DTOs ───

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @MinLength(2)
  fullNameAr: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  positionAr?: string;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  contractStartDate?: string;

  @IsOptional()
  @IsString()
  contractEndDate?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  fullNameAr?: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  positionAr?: string;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  contractStartDate?: string;

  @IsOptional()
  @IsString()
  contractEndDate?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── DELIVERABLE DTOs ───

export class CreateDeliverableDto {
  @IsString()
  trackId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsOptional()
  @IsString()
  outputs?: string;

  @IsOptional()
  @IsString()
  deliveryIndicators?: string;
}

export class UpdateDeliverableDto {
  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nameAr?: string;

  @IsOptional()
  @IsString()
  outputs?: string;

  @IsOptional()
  @IsString()
  deliveryIndicators?: string;
}

// ─── SCOPE DTOs ───

export class CreateScopeDto {
  @IsString()
  trackId: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  titleAr: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateScopeDto {
  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  titleAr?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ─── TRACK KPI DTOs ───

export class CreateTrackKPIDto {
  @IsString()
  trackId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  nameAr: string;
}

export class UpdateTrackKPIDto {
  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nameAr?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

// ─── PENALTY DTOs ───

export class CreatePenaltyDto {
  @IsString()
  trackId: string;

  @IsString()
  violation: string;

  @IsString()
  violationAr: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsNumber()
  impactScore?: number;

  @IsOptional()
  @IsString()
  linkedKpiId?: string;
}

export class UpdatePenaltyDto {
  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  violation?: string;

  @IsOptional()
  @IsString()
  violationAr?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsNumber()
  impactScore?: number;

  @IsOptional()
  @IsString()
  linkedKpiId?: string;

  @IsOptional()
  @IsBoolean()
  isResolved?: boolean;
}
