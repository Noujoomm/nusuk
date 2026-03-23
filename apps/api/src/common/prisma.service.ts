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

    // Validate DATABASE_URL at startup
    if (!rawUrl) {
      const msg = 'DATABASE_URL is not set — cannot start without a database connection';
      console.error(`[PrismaService] FATAL: ${msg}`);
      throw new Error(msg);
    }

    // Detect external managed PostgreSQL (Render, Railway, Neon, Supabase, etc.)
    const isExternalDb =
      rawUrl.includes('.render.com') ||
      rawUrl.includes('.onrender.com') ||
      rawUrl.includes('.railway.app') ||
      rawUrl.includes('.neon.tech') ||
      rawUrl.includes('.supabase.co');

    // Auto-append SSL and connection_limit for external databases
    let url = rawUrl;
    if (isExternalDb) {
      const separator = url.includes('?') ? '&' : '?';
      const params: string[] = [];
      if (!url.includes('sslmode=')) params.push('sslmode=require');
      if (!url.includes('connection_limit=')) params.push('connection_limit=5');
      if (!url.includes('pool_timeout=')) params.push('pool_timeout=15');
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

    // Log Prisma-level errors
    (this as any).$on('error', (e: any) => {
      this.logger.error(`Prisma error: ${e.message}`, e.target);
    });
    (this as any).$on('warn', (e: any) => {
      this.logger.warn(`Prisma warning: ${e.message}`);
    });

    // Startup diagnostics (no secrets)
    const parsed = (() => {
      try { return new URL(url); } catch { return null; }
    })();
    this.logger.log(`DB host: ${parsed?.hostname || 'unknown'}`);
    this.logger.log(`DB port: ${parsed?.port || '5432'}`);
    this.logger.log(`DB name: ${parsed?.pathname?.slice(1) || 'unknown'}`);
    this.logger.log(`SSL: ${url.includes('sslmode=require') ? 'required' : 'not set'}`);
    this.logger.log(`External DB: ${isExternalDb ? 'yes' : 'no (local)'}`);
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from PostgreSQL...');
    await this.$disconnect();
  }

  /**
   * Attempt to connect with bounded retry (5 attempts, exponential backoff).
   * If all attempts fail, throw — NestJS will refuse to start.
   */
  private async connectWithRetry(maxRetries = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log(`Connected to PostgreSQL (attempt ${attempt}/${maxRetries})`);
        return;
      } catch (error: any) {
        const msg = error?.message || String(error);
        this.logger.error(
          `DB connection attempt ${attempt}/${maxRetries} failed: ${msg}`,
        );

        if (attempt === maxRetries) {
          this.logger.error('All DB connection attempts exhausted — aborting startup');
          this.logger.error(
            'Checklist: (1) Is DATABASE_URL correct? (2) Does it include ?sslmode=require for managed DBs? ' +
            '(3) Is the database server running? (4) Are firewall/network rules allowing access?',
          );
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s, 10s (capped)
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        this.logger.warn(`Retrying in ${delay / 1000}s...`);
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
      msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('Connection timed out')
    );
  }

  /**
   * Execute a DB operation with a single retry on transient failures.
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context = 'DB operation',
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (PrismaService.isTransientError(error)) {
        this.logger.warn(`[${context}] Transient DB error — retrying once in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        return operation();
      }
      throw error;
    }
  }

  /**
   * Lightweight connectivity check — runs SELECT 1.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
