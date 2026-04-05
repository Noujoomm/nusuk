import { IsString, IsNumber, IsOptional, IsEnum, Min, MaxLength, IsDateString } from 'class-validator';

export class CreateCustodyDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsNumber() @Min(0) totalAmount: number;
  @IsString() category: string; // OPERATIONAL_SUPPLIES | EVENTS | TRACK_NEEDS
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsString() trackId?: string;
}

export class UpdateCustodyDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() status?: string;
}

export class CreateExpenseDto {
  @IsString() custodyId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateSettlementDto {
  @IsString() custodyId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() date: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
