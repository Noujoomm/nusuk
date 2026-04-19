import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cheap, synchronous input checks that run BEFORE any LLM call.
 * The Haiku off-topic probe from the spec is deliberately deferred — it
 * doubles our Anthropic cost on every request, and the system prompt +
 * tool catalogue already scope the model.
 */

export type GuardrailDecision =
  | { ok: true }
  | { ok: false; reason: string; code: GuardrailCode };

export type GuardrailCode =
  | 'RATE_LIMIT'
  | 'TOO_LONG'
  | 'PROMPT_INJECTION'
  | 'EMPTY';

/** Matches the most common prompt-injection patterns in Arabic + English. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all )?previous (?:instructions|prompts|rules)/i,
  /disregard (?:all )?(?:previous|above) (?:instructions|prompts|rules)/i,
  /system prompt/i,
  /you are now/i,
  /act as (?:if|a)/i,
  /تجاهل (?:جميع )?التعليمات (?:السابقة|أعلاه)/,
  /تجاهل هذه التعليمات/,
  /أنت الآن/,
  /تصرّف كأنك/,
  /اكشف (?:لي )?(?:system prompt|البرومبت)/i,
];

@Injectable()
export class GuardrailsService {
  private readonly logger = new Logger(GuardrailsService.name);

  // Simple in-memory sliding window per user.
  // Phase 2 will move to Redis for multi-replica safety.
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  private maxQueryLength(): number {
    return Number(this.config.get('AI_MAX_QUERY_LENGTH', 2000));
  }

  private ratePerMin(): number {
    return Number(this.config.get('AI_RATE_LIMIT_PER_MIN', 20));
  }

  validate(userId: string, query: string): GuardrailDecision {
    const trimmed = (query ?? '').trim();
    if (!trimmed) return { ok: false, reason: 'الرسالة فارغة', code: 'EMPTY' };

    if (trimmed.length > this.maxQueryLength()) {
      return {
        ok: false,
        reason: `تجاوزت الحد الأقصى لطول الرسالة (${this.maxQueryLength()} حرف).`,
        code: 'TOO_LONG',
      };
    }

    for (const re of INJECTION_PATTERNS) {
      if (re.test(trimmed)) {
        this.logger.warn(
          `Prompt-injection attempt blocked for user=${userId} (pattern=${re})`,
        );
        return {
          ok: false,
          reason: 'لا أستطيع تنفيذ هذا الطلب. تم تسجيل المحاولة.',
          code: 'PROMPT_INJECTION',
        };
      }
    }

    if (!this.rateOK(userId)) {
      return {
        ok: false,
        reason:
          'تجاوزت حد الاستعلامات المسموح (20 طلباً في الدقيقة). انتظر قليلاً ثم حاول.',
        code: 'RATE_LIMIT',
      };
    }

    return { ok: true };
  }

  private rateOK(userId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    const prev = (this.hits.get(userId) ?? []).filter((t) => t > windowStart);
    if (prev.length >= this.ratePerMin()) {
      this.hits.set(userId, prev);
      return false;
    }
    prev.push(now);
    this.hits.set(userId, prev);
    return true;
  }

  /**
   * Output scrubbing — strips external URLs and any accidental leak of the
   * system prompt. Runs before we hand the reply back to the client.
   */
  sanitizeReply(reply: string): string {
    return reply
      .replace(/\bhttps?:\/\/(?!roya2030\.org)\S+/gi, '[رابط خارجي محذوف]')
      .replace(/system prompt|الـsystem prompt|برومبت النظام/gi, '[—]');
  }
}
