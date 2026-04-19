import {
  ForbiddenException,
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ClaudeService } from './services/claude.service';
import { GuardrailsService } from './services/guardrails.service';
import { ToolRegistryService } from './services/tool-registry.service';
import { buildSystemPrompt } from './prompts/system-prompt';
import type { AgentContext } from './interfaces/agent-context.interface';
import type {
  AgentRole,
  ToolDefinition,
} from './interfaces/tool-definition.interface';
import type { ChatMessageDto } from './dto/chat-request.dto';
import { AIActionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * Orchestration for one agent turn:
 *   1. Build context from the authenticated user (server-authoritative).
 *   2. Run guardrails; short-circuit + audit on rejection.
 *   3. Load the role-filtered tool catalogue.
 *   4. Call Claude with tools enabled; execute any tool uses.
 *   5. Scrub the final text; persist one AIAuditLog row per turn.
 */
@Injectable()
export class AIAgentService {
  private readonly logger = new Logger(AIAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly guardrails: GuardrailsService,
    private readonly tools: ToolRegistryService,
  ) {}

  async chat(
    userId: string,
    message: string,
    history: ChatMessageDto[] = [],
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const context = await this.buildContext(userId, meta);
    const started = Date.now();

    // ── Layer 1: input validation ─────────────────────────────────────────
    const decision = this.guardrails.validate(userId, message);
    if (!decision.ok) {
      const status: AIActionStatus =
        decision.code === 'RATE_LIMIT'
          ? 'FAILED'
          : decision.code === 'PROMPT_INJECTION'
          ? 'DENIED_BY_GUARDRAILS'
          : 'FAILED';
      await this.audit({
        context,
        userQuery: message,
        status,
        errorMessage: decision.reason,
        executionMs: Date.now() - started,
      });

      if (decision.code === 'RATE_LIMIT') {
        throw new HttpException(decision.reason, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (decision.code === 'PROMPT_INJECTION') {
        throw new ForbiddenException(decision.reason);
      }
      throw new BadRequestException(decision.reason);
    }

    // ── Layer 3: tool catalogue per role ──────────────────────────────────
    const tools = await this.tools.getForContext(context);

    // ── Claude turn ───────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(context, tools);
    const messages = this.buildMessageList(history, message);

    try {
      const result = await this.claude.chatWithTools({
        systemPrompt,
        messages,
        tools,
        executor: (name, input) => this.executeTool(name, input, context),
      });
      const sanitized = this.guardrails.sanitizeReply(result.text);

      await this.audit({
        context,
        userQuery: message,
        status: 'SUCCESS',
        toolName: result.toolsInvoked.map((t) => t.name).join(',') || null,
        toolInput: null,
        toolOutput: null,
        modelUsed: result.modelUsed,
        executionMs: Date.now() - started,
        reasoning: result.toolsInvoked.length
          ? `invoked ${result.toolsInvoked.length} tool(s) across ${result.toolsInvoked.map((t) => t.name).join(', ')}`
          : null,
      });

      return {
        reply: sanitized,
        modelUsed: result.modelUsed,
        toolsInvoked: result.toolsInvoked.map((t) => ({
          name: t.name,
          ok: t.ok,
          durationMs: t.durationMs,
        })),
        sessionId: context.sessionId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (err: any) {
      this.logger.error(
        `Agent turn failed (user=${userId}): ${err?.message ?? err}`,
      );
      await this.audit({
        context,
        userQuery: message,
        status: 'FAILED',
        errorMessage: String(err?.message ?? err).slice(0, 2000),
        executionMs: Date.now() - started,
      });
      throw err;
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private async buildContext(
    userId: string,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<AgentContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, nameAr: true, role: true },
    });
    if (!user) throw new ForbiddenException('المستخدم غير موجود');

    let allowedTrackIds: string[] = [];
    if (user.role === 'track_lead') {
      const perms = await this.prisma.trackPermission.findMany({
        where: { userId: user.id },
        select: { trackId: true },
      });
      allowedTrackIds = perms.map((p) => p.trackId);
    }

    return {
      userId: user.id,
      userName: user.nameAr || user.name,
      userRole: user.role,
      allowedTrackIds,
      sessionId: randomUUID(),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };
  }

  private buildMessageList(
    history: ChatMessageDto[],
    message: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [
      ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];
  }

  /**
   * Defense-in-depth: even if Claude invokes a tool that wasn't in the
   * filtered catalogue we gave it, we re-check permissions before running.
   */
  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: AgentContext,
  ) {
    const started = Date.now();
    const tool = await this.tools.findByName(name);
    if (!tool) {
      return {
        ok: false,
        output: null,
        durationMs: Date.now() - started,
        errorMessage: `Unknown tool: ${name}`,
      };
    }
    if (!tool.requiredRoles.includes(context.userRole as AgentRole)) {
      this.logger.warn(
        `Tool ${name} denied for role ${context.userRole} (user=${context.userId})`,
      );
      return {
        ok: false,
        output: null,
        durationMs: Date.now() - started,
        errorMessage: 'DENIED_BY_PERMISSIONS',
      };
    }
    try {
      const output = await tool.handler(input, context);
      return { ok: true, output, durationMs: Date.now() - started };
    } catch (e: any) {
      return {
        ok: false,
        output: null,
        durationMs: Date.now() - started,
        errorMessage: String(e?.message ?? e).slice(0, 500),
      };
    }
  }

  private async audit(params: {
    context: AgentContext;
    userQuery: string;
    status: AIActionStatus;
    toolName?: string | null;
    toolInput?: unknown;
    toolOutput?: unknown;
    modelUsed?: string;
    reasoning?: string | null;
    errorMessage?: string;
    executionMs: number;
    isDestructive?: boolean;
    wasConfirmed?: boolean;
  }) {
    try {
      await this.prisma.aIAuditLog.create({
        data: {
          userId: params.context.userId,
          sessionId: params.context.sessionId,
          userQuery: params.userQuery,
          queryType: 'text',
          toolName: params.toolName ?? null,
          toolInput: (params.toolInput ?? null) as any,
          toolOutput: (params.toolOutput ?? null) as any,
          reasoning: params.reasoning ?? null,
          modelUsed: params.modelUsed ?? this.claude.defaultModel(),
          status: params.status,
          errorMessage: params.errorMessage ?? null,
          executionMs: params.executionMs,
          isDestructive: params.isDestructive ?? false,
          wasConfirmed: params.wasConfirmed ?? false,
          ipAddress: params.context.ipAddress ?? null,
          userAgent: params.context.userAgent ?? null,
        },
      });
    } catch (e: any) {
      // Audit failure must never break the user-visible flow.
      this.logger.error(`Audit log write failed: ${e?.message ?? e}`);
    }
  }
}
