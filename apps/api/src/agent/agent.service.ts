import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIService } from '../openai/openai.service';
import { PrismaService } from '../common/prisma.service';
import {
  AgentUserContext,
  renderAgentSystemPrompt,
} from './agent-prompt';
import { ChatMessageDto } from './agent.dto';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly openai: OpenAIService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Build the AgentUserContext straight from the authenticated user record —
   * never from anything the client sent. Role spoofing attempts stop here.
   */
  async buildContext(userId: string): Promise<AgentUserContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        nameAr: true,
        role: true,
      },
    });
    if (!user) {
      // JwtAuthGuard would normally catch this, but guard against stale tokens.
      throw new Error('User not found');
    }

    // Phase 1: track ownership is role-derived. track_lead's track assignments
    // live on TrackPermission; we only expose ids (not names) to the prompt.
    let trackIds: string[] = [];
    if (user.role === 'track_lead') {
      const perms = await this.prisma.trackPermission.findMany({
        where: { userId: user.id },
        select: { trackId: true },
      });
      trackIds = perms.map((p) => p.trackId);
    }

    return {
      userId: user.id,
      userName: user.nameAr || user.name,
      userRole: user.role,
      userTrackIds: trackIds.length ? trackIds : undefined,
      currentDateIso: new Date().toISOString(),
      llmDisplayName: this.config.get('OPENAI_MODEL', 'gpt-4o'),
    };
  }

  async chat(
    userId: string,
    message: string,
    history: ChatMessageDto[] = [],
  ): Promise<{ reply: string; modelUsed: string }> {
    const ctx = await this.buildContext(userId);
    const system = renderAgentSystemPrompt(ctx);

    // Trim history so the aggregate never exceeds a sane cap. Most recent wins.
    const bounded = history.slice(-20);

    const messages = [
      { role: 'system' as const, content: system },
      ...bounded.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    try {
      const reply = await this.openai.chat(messages, {
        temperature: 0.4,
        maxTokens: 1500,
      });
      return {
        reply: reply.trim(),
        modelUsed: this.config.get('OPENAI_MODEL', 'gpt-4o'),
      };
    } catch (e: any) {
      this.logger.error(`Agent chat failed for user ${userId}: ${e.message}`);
      throw e;
    }
  }
}
