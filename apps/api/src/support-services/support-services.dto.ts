import { IsString, IsNumber, IsOptional, Min, MaxLength, IsDateString, IsEnum } from 'class-validator';

export class CreateCustodyDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsNumber() @Min(0) initialBalance: number;
  @IsDateString() balanceAddedAt: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateCustodyDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
}

export class CloseCustodyDto {
  @IsOptional() @IsString() @MaxLength(2000) closingNotes?: string;
}

export class CreateInvoiceDto {
  @IsString() custodyId: string;
  @IsString() @MaxLength(300) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() invoiceDate: string;
  @IsOptional() @IsString() invoiceNumber?: string;
}

export class UpdateInvoiceStatusDto {
  @IsEnum(['APPROVED', 'REJECTED']) status: string;
}

export class AddMemberDto {
  @IsString() custodyId: string;
  @IsString() userId: string;
  @IsOptional() @IsString() roleType?: string; // manager | custodian | executor | viewer
}
