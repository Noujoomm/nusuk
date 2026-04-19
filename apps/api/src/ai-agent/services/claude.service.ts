import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from '../interfaces/tool-definition.interface';

/**
 * Thin wrapper around the Anthropic SDK. Phase 1 exposes a single
 * non-streaming entry point; streaming (SSE) is Phase 2.
 *
 * Model selection is env-driven (`ANTHROPIC_MODEL_DEFAULT`), so swapping
 * sonnet-4-5 → sonnet-4-6 → opus-4-7 is a config change, not a code change.
 */

export interface ClaudeChatMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: unknown }
        | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
      >;
}

export interface ClaudeChatResult {
  /** Final text reply shown to the user. */
  text: string;
  /** Model id actually used for this turn. */
  modelUsed: string;
  /** Summary of any tool invocations performed during the turn. */
  toolsInvoked: Array<{ name: string; input: unknown; ok: boolean; durationMs: number }>;
  /** Raw token counts for cost/audit. */
  inputTokens: number;
  outputTokens: number;
}

interface RunToolResult {
  ok: boolean;
  output: unknown;
  durationMs: number;
  errorMessage?: string;
}

type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<RunToolResult>;

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set — /ai-agent/chat will return 503 until configured',
      );
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  private ensure(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'المساعد غير متاح حالياً: ANTHROPIC_API_KEY غير مضبوط على الخادم.',
      );
    }
    return this.client;
  }

  defaultModel(): string {
    return this.config.get('ANTHROPIC_MODEL_DEFAULT', 'claude-sonnet-4-5');
  }

  /**
   * Run an agentic turn: send messages + tools to Claude, execute any tool
   * uses returned, feed results back, and loop until the model emits a final
   * text response (or we hit `maxIterations`). Non-streaming.
   */
  async chatWithTools(params: {
    systemPrompt: string;
    messages: ClaudeChatMessage[];
    tools: ToolDefinition[];
    executor: ToolExecutor;
    maxIterations?: number;
  }): Promise<ClaudeChatResult> {
    const client = this.ensure();
    const model = this.defaultModel();
    const maxIterations = params.maxIterations ?? 5;
    const maxTokens = Number(this.config.get('AI_MAX_TOKENS_PER_RESPONSE', 4096));

    const anthropicTools = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    }));

    const conversation: ClaudeChatMessage[] = [...params.messages];
    const toolsInvoked: ClaudeChatResult['toolsInvoked'] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let finalText = '';

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: params.systemPrompt,
        messages: conversation as Anthropic.MessageParam[],
        tools: anthropicTools.length
          ? (anthropicTools as unknown as Anthropic.Tool[])
          : undefined,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      // Collect text + any tool uses from this turn.
      const textParts: string[] = [];
      const toolUses: Array<{ id: string; name: string; input: unknown }> = [];
      for (const block of response.content) {
        if (block.type === 'text') textParts.push(block.text);
        else if (block.type === 'tool_use')
          toolUses.push({ id: block.id, name: block.name, input: block.input });
      }

      if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
        // Echo the assistant turn back into the conversation, then run tools.
        conversation.push({
          role: 'assistant',
          content: response.content as any,
        });

        const results: Array<{
          type: 'tool_result';
          tool_use_id: string;
          content: string;
          is_error?: boolean;
        }> = [];
        for (const use of toolUses) {
          const exec = await params.executor(
            use.name,
            (use.input as Record<string, unknown>) ?? {},
          );
          toolsInvoked.push({
            name: use.name,
            input: use.input,
            ok: exec.ok,
            durationMs: exec.durationMs,
          });
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(
              exec.ok
                ? exec.output
                : { error: exec.errorMessage ?? 'tool execution failed' },
            ),
            is_error: !exec.ok,
          });
        }
        conversation.push({ role: 'user', content: results as any });
        continue; // next iteration — let Claude read the tool results.
      }

      // stop_reason in {'end_turn', 'max_tokens', 'stop_sequence'}
      finalText = textParts.join('\n').trim();
      break;
    }

    return {
      text: finalText,
      modelUsed: model,
      toolsInvoked,
      inputTokens,
      outputTokens,
    };
  }
}
