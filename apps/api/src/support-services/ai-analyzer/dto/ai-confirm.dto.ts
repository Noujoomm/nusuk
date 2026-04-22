import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceExtractionDto } from './invoice-extraction.dto';

/**
 * Confirmation payload sent from the UI after the user reviews (and optionally
 * edits) the AI-extracted invoice. `extractionId` links back to the pending
 * upload so we can promote it to a real CustodyInvoice + retire the temp file.
 */
export class AIConfirmDto {
  @IsString() extractionId: string;

  @ValidateNested()
  @Type(() => InvoiceExtractionDto)
  editedData: InvoiceExtractionDto;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
}
