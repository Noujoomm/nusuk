import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AgentService } from './agent.service';
import { ChatRequestDto } from './agent.dto';

/**
 * Roya Assistant endpoints (مساعد رؤية).
 *
 * All six roles (admin, system_manager, pm, track_lead, employee, hr) can
 * talk to the assistant; per-role behaviour is enforced by the prompt +
 * by the tool catalogue (Phase 2), not by controller-level @Roles.
 */
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('chat')
  async chat(@CurrentUser() user: { id: string }, @Body() dto: ChatRequestDto) {
    return this.agent.chat(user.id, dto.message, dto.history ?? []);
  }
}
