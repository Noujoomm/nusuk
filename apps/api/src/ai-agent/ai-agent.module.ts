import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { SupportServicesModule } from '../support-services/support-services.module';
import { DistributionModule } from '../distribution/distribution.module';
import { AIAgentController } from './ai-agent.controller';
import { AIAgentService } from './ai-agent.service';
import { ClaudeService } from './services/claude.service';
import { GuardrailsService } from './services/guardrails.service';
import { ToolRegistryService } from './services/tool-registry.service';

/**
 * AI Agent module (مساعد رؤية). Phase 1: non-streaming chat endpoint that
 * wraps Anthropic Claude, exposes 3 read-only tools against existing
 * services, and writes every turn to the AIAuditLog table.
 *
 * Note: this coexists with the simpler `agent/` module that serves the
 * current `/assistant` page. The latter talks to OpenAI; this one talks to
 * Anthropic and will back the future Cmd+K Command Palette (Phase 2+).
 */
@Module({
  imports: [PrismaModule, SupportServicesModule, DistributionModule],
  controllers: [AIAgentController],
  providers: [AIAgentService, ClaudeService, GuardrailsService, ToolRegistryService],
})
export class AIAgentModule {}
