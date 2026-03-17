/**
 * Safe pagination utilities.
 *
 * WHY THIS EXISTS
 * ---------------
 * NestJS is configured with `transform: true, enableImplicitConversion: true`
 * in the global ValidationPipe.  When a controller declares
 *   `@Query('page') page?: number`
 * class-transformer will attempt an implicit string→number coercion.
 * For absent, empty or non-numeric query params it can produce `NaN`
 * instead of `undefined`, which bypasses service-level defaults and
 * ultimately passes `skip: NaN` to Prisma, crashing with
 * `PrismaClientValidationError`.
 *
 * SOLUTION
 * --------
 * Declare all pagination query params as `?: string` (opt out of
 * implicit conversion) and route them through `parsePage` / `parseLimit`
 * before they reach any service or Prisma call.
 */

/**
 * Parse a raw query-string value into a safe page number.
 * Returns `defaultVal` (≥ 1) for any non-positive, NaN, or absent input.
 */
export function parsePage(raw: unknown, defaultVal = 1): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? n : defaultVal;
}

/**
 * Parse a raw query-string value into a safe page-size / limit.
 * Clamps to [1, maxVal] and falls back to `defaultVal` when invalid.
 */
export function parseLimit(raw: unknown, defaultVal = 25, maxVal = 100): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, maxVal);
}

/**
 * Convert validated page + limit into Prisma-safe skip/take.
 * Guaranteed to return non-NaN, non-negative integers.
 */
export function buildSkipTake(page: number, limit: number): { skip: number; take: number } {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 25;
  return { skip: (safePage - 1) * safeLimit, take: safeLimit };
}
