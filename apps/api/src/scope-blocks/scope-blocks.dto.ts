import { IsString, IsOptional, IsNumber, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateScopeBlockDto {
  @IsString()
  trackId: string;

  @IsString()
  code: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateScopeBlockDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ImportScopeTextDto {
  @IsString()
  trackId: string;

  @IsString()
  text: string;
}

export class UpdateScopeBlockProgressDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ReorderBlockItemDto {
  @IsString()
  id: string;

  @IsNumber()
  orderIndex: number;
}

export class ReorderBlocksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderBlockItemDto)
  blocks: ReorderBlockItemDto[];
}

export class CreateScopeBlockUpdateDto {
  @IsString()
  scopeBlockId: string;

  @IsString()
  content: string;
}
