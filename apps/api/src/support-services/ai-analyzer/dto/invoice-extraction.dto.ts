import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Final shape of a single line item on a Saudi invoice after extraction.
 * Kept permissive so manually-edited values (e.g. decimal quantities from
 * fuel receipts) don't trip validation.
 */
export class InvoiceItemDto {
  @IsString() @MaxLength(400) description: string;
  @IsNumber() @Min(0) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsNumber() @Min(0) total: number;
}

/**
 * Full extracted-invoice payload. Used both as the response shape from
 * /ai-analyze AND as the editable payload in /ai-confirm — the user may
 * tweak any field before persisting.
 */
export class InvoiceExtractionDto {
  @IsString() @MaxLength(250) vendorName: string;
  @IsOptional() @IsString() @MaxLength(60) vendorTaxNumber?: string | null;

  @IsString() @MaxLength(80) invoiceNumber: string;
  /** ISO-8601 date string (YYYY-MM-DD). */
  @IsString() invoiceDate: string;
  @IsOptional() @IsString() @MaxLength(40) hijriDate?: string | null;

  @IsNumber() @Min(0) subtotal: number;
  @IsNumber() @Min(0) vatAmount: number;
  @IsNumber() @Min(0) @Max(100) vatPercentage: number;
  @IsNumber() @Min(0) totalAmount: number;

  @IsIn(['SAR', 'USD', 'EUR', 'AED'])
  currency: 'SAR' | 'USD' | 'EUR' | 'AED';

  @IsOptional() @IsString() @MaxLength(80) paymentMethod?: string | null;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsNumber() @Min(0) @Max(1) confidence: number;
}
