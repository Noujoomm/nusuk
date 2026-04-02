import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/** Prisma error codes that indicate a transient connectivity issue. */
const TRANSIENT_ERROR_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server was reached but timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the pool
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Throttle map: message-key → last-logged timestamp */
  private logThrottle = new Map<string, number>();
  private static readonly THROTTLE_WINDOW_MS = 30_000; // 30 seconds per unique message

  constructor() {
    const rawUrl = process.env.DATABASE_URL || '';

    if (!rawUrl) {
      const msg = 'DATABASE_URL is not set — cannot start without a database connection';
      console.error(`[PrismaService] FATAL: ${msg}`);
      throw new Error(msg);
    }

    const isExternalDb =
      rawUrl.includes('.render.com') ||
      rawUrl.includes('.onrender.com') ||
      rawUrl.includes('.railway.app') ||
      rawUrl.includes('.neon.tech') ||
      rawUrl.includes('.supabase.co');

    let url = rawUrl;
    if (isExternalDb) {
      const separator = url.includes('?') ? '&' : '?';
      const params: string[] = [];
      if (!url.includes('sslmode=')) params.push('sslmode=require');
      if (!url.includes('connection_limit=')) params.push('connection_limit=20');
      if (!url.includes('pool_timeout=')) params.push('pool_timeout=30');
      if (params.length > 0) {
        url = `${url}${separator}${params.join('&')}`;
      }
    }

    super({
      datasources: { db: { url } },
      log: [
        { emit: 'event', level: 'error' },
      ],
    });

    // Throttled Prisma error event — prevents log flood from repeated pool errors
    (this as any).$on('error', (e: any) => {
      this.logThrottled('error', `Prisma: ${e.message}`);
    });

    // One-time startup diagnostic
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    this.logger.log(`DB: ${parsed?.hostname || 'unknown'}:${parsed?.port || '5432'}/${parsed?.pathname?.slice(1) || '?'} | SSL: ${url.includes('sslmode=require') ? 'yes' : 'no'} | Pool: 20`);
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async connectWithRetry(maxRetries = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log(`Connected to PostgreSQL (attempt ${attempt}/${maxRetries})`);
        return;
      } catch (error: any) {
        this.logger.error(`DB connect attempt ${attempt}/${maxRetries} failed: ${error?.message}`);
        if (attempt === maxRetries) {
          this.logger.error('All DB connection attempts exhausted — aborting');
          throw error;
        }
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  /**
   * Returns true if the error is a known transient Prisma/DB connectivity issue.
   */
  static isTransientError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return TRANSIENT_ERROR_CODES.has(error.code);
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return true;
    }
    const msg = (error as any)?.message || '';
    return (
      msg.includes('Server has closed the connection') ||
      msg.includes("Can't reach database server") ||
      msg.includes('Timed out fetching a new connection from the connection pool') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('Connection timed out')
    );
  }

  /**
   * Execute a DB operation with up to 3 retries on transient failures.
   * Retry logs are throttled to prevent flood.
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context = 'DB',
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (PrismaService.isTransientError(error) && attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          this.logThrottled('warn', `[${context}] Transient DB error, retry ${attempt}/${maxRetries} in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unreachable');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Log at most once per THROTTLE_WINDOW_MS for each unique message key.
   * Prevents Railway log flood from repeated Prisma pool errors.
   */
  private logThrottled(level: 'error' | 'warn', message: string) {
    // Use first 80 chars as throttle key to group similar messages
    const key = message.slice(0, 80);
    const now = Date.now();
    const lastLogged = this.logThrottle.get(key);

    if (lastLogged && now - lastLogged < PrismaService.THROTTLE_WINDOW_MS) {
      return; // Suppress duplicate
    }

    this.logThrottle.set(key, now);

    // Cleanup old entries periodically (prevent memory leak)
    if (this.logThrottle.size > 100) {
      const cutoff = now - PrismaService.THROTTLE_WINDOW_MS;
      for (const [k, v] of this.logThrottle) {
        if (v < cutoff) this.logThrottle.delete(k);
      }
    }

    if (level === 'error') {
      this.logger.error(message);
    } else {
      this.logger.warn(message);
    }
  }
}
