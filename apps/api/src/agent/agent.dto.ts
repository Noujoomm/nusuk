import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** One turn in the chat — either from the user or a previous assistant reply. */
export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content: string;
}

export class ChatRequestDto {
  /**
   * Current user turn. Kept separate from history so the server can append it
   * after running its own validation / context injection.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message: string;

  /**
   * Optional prior turns for this conversation. Client-maintained in Phase 1
   * (no DB persistence yet). Capped so a runaway client can't blow the prompt.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
