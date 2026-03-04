import {
  IsString, IsOptional, IsEnum, IsNumber, IsArray,
  IsDateString, IsBoolean, Min, Max, MinLength,
  ValidateNested, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Gantt Task DTOs ───

export class CreateGanttTaskDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  titleAr: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsString()
  trackId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;

  @IsOptional()
  @IsBoolean()
  isSummary?: boolean;

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'])
  constraintType?: string;

  @IsOptional()
  @IsDateString()
  constraintDate?: string;

  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}

export class UpdateGanttTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  titleAr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;

  @IsOptional()
  @IsBoolean()
  isSummary?: boolean;

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'under_review', 'completed', 'delayed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'])
  constraintType?: string;

  @IsOptional()
  @IsDateString()
  constraintDate?: string;

  @IsOptional()
  @IsDateString()
  baselineStart?: string;

  @IsOptional()
  @IsDateString()
  baselineFinish?: string;

  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class BulkUpdateGanttTaskDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsNumber()
  progress?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  parentTaskId?: string;
}

export class BulkUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateGanttTaskDto)
  tasks: BulkUpdateGanttTaskDto[];
}

// ─── Dependency DTOs ───

export class CreateDependencyDto {
  @IsString()
  predecessorId: string;

  @IsString()
  successorId: string;

  @IsOptional()
  @IsEnum(['FS', 'SS', 'FF', 'SF'])
  type?: string;

  @IsOptional()
  @IsNumber()
  lag?: number;
}

export class UpdateDependencyDto {
  @IsOptional()
  @IsEnum(['FS', 'SS', 'FF', 'SF'])
  type?: string;

  @IsOptional()
  @IsNumber()
  lag?: number;
}

// ─── Calendar DTOs ───

export class CreateCalendarDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  workDays?: number[];

  @IsOptional()
  @IsNumber()
  workStartHour?: number;

  @IsOptional()
  @IsNumber()
  workEndHour?: number;

  @IsOptional()
  holidays?: any[];

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateCalendarDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  workDays?: number[];

  @IsOptional()
  @IsNumber()
  workStartHour?: number;

  @IsOptional()
  @IsNumber()
  workEndHour?: number;

  @IsOptional()
  holidays?: any[];

  @IsOptional()
  @IsString()
  timezone?: string;
}

// ─── Resource Assignment DTOs ───

export class CreateResourceAssignmentDto {
  @IsString()
  taskId: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  units?: number;

  @IsOptional()
  @IsNumber()
  costRate?: number;
}

// ─── Baseline DTOs ───

export class SetBaselineDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskIds?: string[]; // if empty, baseline all tasks
}

// ─── Query DTOs ───

export class GanttQueryDto {
  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['track', 'responsible', 'status', 'priority'])
  groupBy?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  tags?: string; // comma-separated
}
