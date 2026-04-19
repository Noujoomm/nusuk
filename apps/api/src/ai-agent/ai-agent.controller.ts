import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AIAgentService } from './ai-agent.service';
import { ChatRequestDto } from './dto/chat-request.dto';

/**
 * Phase 1 surface: a single non-streaming endpoint. SSE streaming is Phase 2;
 * voice (STT/TTS) is Phase 3. Auth is required; per-role behaviour comes
 * from the tool catalogue filter inside the service.
 */
@Controller('ai-agent')
@UseGuards(JwtAuthGuard)
export class AIAgentController {
  constructor(private readonly agent: AIAgentService) {}

  @Post('chat')
  async chat(
    @CurrentUser() user: { id: string },
    @Body() dto: ChatRequestDto,
    @Req() req: Request,
  ) {
    return this.agent.chat(user.id, dto.message, dto.history ?? [], {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
