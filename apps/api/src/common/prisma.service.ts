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
    const url = process.env.DATABASE_URL || '';
    const isRender = url.includes('.render.com') || url.includes('.onrender.com');

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

    if (isRender) {
      this.logger.log('Render PostgreSQL detected — using production connection settings');
    }
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from PostgreSQL...');
    await this.$disconnect();
  }

  /**
   * Attempt to connect with bounded retry (3 attempts, exponential backoff).
   * If all attempts fail, throw — NestJS will refuse to start.
   */
  private async connectWithRetry(maxRetries = 3): Promise<void> {
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
          throw error;
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        this.logger.warn(`Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  /**
   * Returns true if the error is a known transient Prisma/DB connectivity issue.
   * Use this in services to decide whether to retry or surface the error.
   */
  static isTransientError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return TRANSIENT_ERROR_CODES.has(error.code);
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return true;
    }
    // Catch raw "Server has closed the connection" / ECONNREFUSED
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
   * Suitable for scheduler jobs and background tasks.
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
