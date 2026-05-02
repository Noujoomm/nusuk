import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceExtractionDto } from './invoice-extraction.dto';

/**
 * One invoice the user has approved for permanent save out of a previously
 * analyzed batch. The {@link index} ties back to the original upload position
 * in the batch (so we can find the right temp file to promote).
 */
export class BatchSaveItemDto {
  @IsInt() @Min(0) index: number;

  @ValidateNested()
  @Type(() => InvoiceExtractionDto)
  editedData: InvoiceExtractionDto;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
}

/**
 * Final-save payload for a batch analysis. Only items the user marks ready
 * are submitted here — failed/excluded entries from the same batch are not
 * sent. All saves run inside a single Prisma transaction; if any one fails,
 * the whole batch is rolled back.
 */
export class BatchSaveDto {
  @IsString() batchId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BatchSaveItemDto)
  invoices: BatchSaveItemDto[];
}
