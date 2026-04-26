import { compareTwoStrings } from 'string-similarity';
import { normalizeArabic, tokenizeName } from './arabic-normalizer';

export interface MatchCandidate {
  id: string;
  fullName: string;
  normalizedName: string;
  employeeNumber: string | null;
  aliases: string[];
}

export interface MatchResult {
  candidateId: string;
  confidence: number;          // 0–1
  method: 'employee_number' | 'name_exact' | 'fuzzy_name' | 'token_match';
}

/** Threshold below which a fuzzy match is considered a miss. */
const FUZZY_THRESHOLD = 0.8;
/** Token-overlap threshold (fraction of input tokens found in candidate). */
const TOKEN_THRESHOLD = 0.6;

/**
 * Resolves a raw PDF name (and optional employee number) to one of the seeded
 * employees. Tries strategies in order — first hit wins. Returns null if no
 * candidate clears the thresholds.
 *
 * Strategies:
 *  1. Employee number — if the PDF row carries a number that matches an
 *     already-linked employee.
 *  2. Exact normalized — same Arabic letters after Persian/hamza/heh folding.
 *  3. Fuzzy — Dice coefficient on the normalized strings.
 *  4. Token — overlap of name tokens (handles missing middle names).
 */
export function matchEmployee(
  rawName: string,
  rawEmployeeNumber: string | null,
  candidates: MatchCandidate[],
): MatchResult | null {
  if (!rawName && !rawEmployeeNumber) return null;

  // 1) Employee number
  if (rawEmployeeNumber) {
    const byNum = candidates.find((c) => c.employeeNumber === rawEmployeeNumber);
    if (byNum) return { candidateId: byNum.id, confidence: 1, method: 'employee_number' };
  }

  const normInput = normalizeArabic(rawName);
  if (!normInput) return null;

  // 2) Exact normalized — fullName OR any alias
  for (const c of candidates) {
    if (c.normalizedName === normInput) {
      return { candidateId: c.id, confidence: 1, method: 'name_exact' };
    }
    if (c.aliases.some((a) => normalizeArabic(a) === normInput)) {
      return { candidateId: c.id, confidence: 1, method: 'name_exact' };
    }
  }

  // 3) Fuzzy (Dice coefficient on the normalized strings)
  let bestFuzzy: { c: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    const score = compareTwoStrings(normInput, c.normalizedName);
    if (!bestFuzzy || score > bestFuzzy.score) bestFuzzy = { c, score };
  }
  if (bestFuzzy && bestFuzzy.score >= FUZZY_THRESHOLD) {
    return {
      candidateId: bestFuzzy.c.id,
      confidence: bestFuzzy.score,
      method: 'fuzzy_name',
    };
  }

  // 4) Token overlap — useful when PDF strips a middle name vs Excel.
  //    "فراس سمير ظفر" (3 tokens) vs Excel "فراس سمير عبدالله ظفر" (4 tokens)
  //    common tokens = 3 → input coverage = 3/3 = 1.0 ≥ 0.6, candidate
  //    coverage = 3/4 = 0.75. Combined score lets fuzzy still win on close
  //    matches; we fall back here only when fuzzy fails.
  const inputTokens = tokenizeName(rawName);
  if (inputTokens.length === 0) return null;
  let bestToken: { c: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    const candTokens = tokenizeName(c.fullName);
    if (candTokens.length === 0) continue;
    const inputSet = new Set(inputTokens);
    const overlap = candTokens.filter((t) => inputSet.has(t)).length;
    // Score: harmonic mean of recall (overlap / input tokens) and precision
    // (overlap / candidate tokens). Penalises huge candidate names that
    // accidentally contain all input tokens.
    if (overlap === 0) continue;
    const recall = overlap / inputTokens.length;
    const precision = overlap / candTokens.length;
    const score = (2 * recall * precision) / (recall + precision);
    if (!bestToken || score > bestToken.score) bestToken = { c, score };
  }
  if (bestToken && bestToken.score >= TOKEN_THRESHOLD) {
    return {
      candidateId: bestToken.c.id,
      confidence: bestToken.score,
      method: 'token_match',
    };
  }

  return null;
}
