import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';

/**
 * Re-runs Claude Vision on the listed indices of an existing batch session.
 * The original upload is read from the batch's retry copy on disk, so the
 * user does not need to re-upload anything.
 */
export class BatchRetryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  indices: number[];
}
