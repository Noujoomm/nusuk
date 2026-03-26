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

  constructor() {
    const rawUrl = process.env.DATABASE_URL || '';

    if (!rawUrl) {
      const msg = 'DATABASE_URL is not set — cannot start without a database connection';
      console.error(`[PrismaService] FATAL: ${msg}`);
      throw new Error(msg);
    }

    // Detect external managed PostgreSQL
    const isExternalDb =
      rawUrl.includes('.render.com') ||
      rawUrl.includes('.onrender.com') ||
      rawUrl.includes('.railway.app') ||
      rawUrl.includes('.neon.tech') ||
      rawUrl.includes('.supabase.co');

    // Auto-append SSL and connection pool params for external databases
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
        { emit: 'event', level: 'warn' },
      ],
    });

    (this as any).$on('error', (e: any) => {
      this.logger.error(`Prisma error: ${e.message}`, e.target);
    });
    (this as any).$on('warn', (e: any) => {
      this.logger.warn(`Prisma warning: ${e.message}`);
    });

    // Startup diagnostics (no secrets)
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    this.logger.log(`DB: ${parsed?.hostname || 'unknown'}:${parsed?.port || '5432'}/${parsed?.pathname?.slice(1) || '?'} | SSL: ${url.includes('sslmode=require') ? 'yes' : 'no'} | External: ${isExternalDb ? 'yes' : 'no'}`);
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
        this.logger.error(`DB connection attempt ${attempt}/${maxRetries} failed: ${error?.message}`);
        if (attempt === maxRetries) {
          this.logger.error('All DB connection attempts exhausted — aborting startup');
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
   * Backoff: 1s → 2s → 4s
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context = 'DB operation',
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (PrismaService.isTransientError(error) && attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          this.logger.warn(`[${context}] Transient DB error (attempt ${attempt}/${maxRetries}) — retrying in ${delay}ms...`);
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
}
