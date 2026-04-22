/**
 * Levenshtein distance — used to compare vendor names when detecting
 * near-duplicate invoices. Keeps iteration memory O(min(a,b)) instead of
 * the classic O(a*b) matrix.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Always keep the shorter string on the inner axis.
  if (a.length < b.length) [a, b] = [b, a];

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,    // insertion
        prev[j] + 1,        // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity score in [0, 1]. 1 = identical, 0 = fully different. */
export function similarity(a: string, b: string): number {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

export interface CandidateInvoice {
  id: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: number;
  invoiceDate: Date;
}

export interface SimilarInvoice {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  similarity: number;
}

/**
 * Score a candidate invoice against an extracted one. Weights:
 *   vendor name similarity    × 0.35
 *   invoiceNumber exact match × 0.30
 *   totalAmount within 1 SAR  × 0.20
 *   date within ±2 days       × 0.15
 */
export function scoreCandidate(
  extracted: {
    vendorName: string | null;
    invoiceNumber: string | null;
    totalAmount: number;
    invoiceDate: string;
  },
  candidate: CandidateInvoice,
): number {
  const vendorSim = similarity(extracted.vendorName ?? '', candidate.vendorName ?? '');
  const numberMatch =
    extracted.invoiceNumber &&
    candidate.invoiceNumber &&
    extracted.invoiceNumber.trim() === candidate.invoiceNumber.trim()
      ? 1
      : 0;
  const amountClose = Math.abs(extracted.totalAmount - candidate.totalAmount) <= 1 ? 1 : 0;
  const daysApart =
    Math.abs(
      new Date(extracted.invoiceDate).getTime() - candidate.invoiceDate.getTime(),
    ) /
    86_400_000;
  const dateClose = daysApart <= 2 ? 1 : 0;

  return vendorSim * 0.35 + numberMatch * 0.3 + amountClose * 0.2 + dateClose * 0.15;
}

export interface DuplicateCheck {
  isDuplicate: boolean;
  similarInvoices: SimilarInvoice[];
}

export function detectDuplicates(
  extracted: {
    vendorName: string | null;
    invoiceNumber: string | null;
    totalAmount: number;
    invoiceDate: string;
  },
  candidates: CandidateInvoice[],
  opts: { topK?: number; duplicateThreshold?: number } = {},
): DuplicateCheck {
  const topK = opts.topK ?? 3;
  const duplicateThreshold = opts.duplicateThreshold ?? 0.85;

  const scored = candidates
    .map((c) => ({
      candidate: c,
      score: scoreCandidate(extracted, c),
      vendorSim: similarity(extracted.vendorName ?? '', c.vendorName ?? ''),
      numberMatches:
        !!extracted.invoiceNumber &&
        !!c.invoiceNumber &&
        extracted.invoiceNumber.trim() === c.invoiceNumber.trim(),
    }))
    .filter((x) => x.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const similarInvoices: SimilarInvoice[] = scored.map((s) => ({
    id: s.candidate.id,
    vendor: s.candidate.vendorName ?? '—',
    amount: s.candidate.totalAmount,
    date: s.candidate.invoiceDate.toISOString(),
    similarity: Number(s.score.toFixed(3)),
  }));

  // Hard-duplicate if any candidate matches invoice# + high vendor similarity,
  // or overall score exceeds threshold.
  const isDuplicate = scored.some(
    (s) => (s.numberMatches && s.vendorSim > 0.6) || s.score >= duplicateThreshold,
  );

  return { isDuplicate, similarInvoices };
}
