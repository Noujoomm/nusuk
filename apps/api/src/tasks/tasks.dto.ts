import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsDateString, Min, Max, MinLength, ValidateIf } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(2, { message: 'العنوان يجب أن يكون حرفين على الأقل' })
  title: string;

  @IsString()
  @MinLength(2, { message: 'العنوان بالعربية مطلوب' })
  titleAr: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'under_review', 'completed', 'delayed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  scopeBlockId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.1, { message: 'الوزن يجب أن يكون أكبر من صفر' })
  @Max(10, { message: 'الوزن يجب أن لا يتجاوز 10' })
  weight?: number;

  // Polymorphic assignment
  @IsEnum(['TRACK', 'USER', 'HR', 'GLOBAL'], { message: 'نوع التعيين غير صالح' })
  assigneeType: string;

  @ValidateIf((o) => o.assigneeType === 'TRACK')
  @IsString({ message: 'معرف المسار مطلوب عند التعيين لمسار' })
  assigneeTrackId?: string;

  @ValidateIf((o) => o.assigneeType === 'USER')
  @IsString({ message: 'معرف المستخدم مطلوب عند التعيين لموظف' })
  assigneeUserId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}

export class UpdateTaskDto {
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
  @IsEnum(['pending', 'in_progress', 'under_review', 'completed', 'delayed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  scopeBlockId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  weight?: number;

  // Polymorphic assignment (optional on update)
  @IsOptional()
  @IsEnum(['TRACK', 'USER', 'HR', 'GLOBAL'], { message: 'نوع التعيين غير صالح' })
  assigneeType?: string;

  @IsOptional()
  @IsString()
  assigneeTrackId?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}

export class UpdateTaskStatusDto {
  @IsEnum(['pending', 'in_progress', 'under_review', 'completed', 'delayed', 'cancelled'])
  status: string;
}

export class AssignTaskDto {
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}

// ─── TaskChecklist DTOs ───

export class CreateChecklistItemDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  titleAr?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  titleAr?: string;

  @IsOptional()
  @IsEnum(['pending', 'approved', 'completed', 'needs_revision'])
  status?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── AdminNote DTOs ───

export class CreateAdminNoteDto {
  @IsString()
  @MinLength(1, { message: 'محتوى الملاحظة مطلوب' })
  content: string;
}

export class UpdateAdminNoteDto {
  @IsString()
  @MinLength(1)
  content: string;
}

// ─── TaskUpdate DTOs ───

export class CreateTaskUpdateDto {
  @IsString()
  @MinLength(1, { message: 'محتوى التحديث مطلوب' })
  content: string;
}
