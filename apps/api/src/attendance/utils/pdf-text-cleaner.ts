/**
 * Cleans the raw text extracted by pdf-parse from the biometric PDF reports.
 *
 * The PDF stores Arabic in presentation forms (ﺑ instead of ب) and inserts a
 * tab between every glyph plus a space-tab between visual words. NFKC undoes
 * the presentation forms; we then collapse intra-word tabs and treat
 * space-then-tab (or tab-then-space) as the actual word separator.
 *
 * Output: per-line strings where each Arabic word is one contiguous token
 * separated from neighbours by a single space.
 *
 * IMPORTANT: tokens come out in VISUAL left-to-right order. For Arabic
 * content this is the REVERSE of logical reading order. Callers must remember
 * this — e.g. the employee number column appears at the END of each line.
 */
export function cleanPdfText(raw: string): string[] {
  if (!raw) return [];
  const normalized = raw.normalize('NFKC');
  const lines = normalized
    .split(/\r?\n/)
    .map((line) =>
      line
        // Word boundary patterns first (one whitespace + tab, in either order)
        .replace(/ \t+/g, ' ')
        .replace(/\t+ /g, ' ')
        // Pure-tab runs that survived are intra-word: drop them to merge letters
        .replace(/\t+/g, '')
        // Final whitespace cleanup
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return lines;
}

/**
 * Fixes Arabic letter-order artifacts that survive NFKC. The biometric PDF
 * stores certain glyphs in a way that decomposes to the constituent letters
 * REVERSED (e.g. "محمد" comes out as "دمحم"). We map known cases here.
 *
 * Add new entries when you find them in the wild — better than letting the
 * fuzzy matcher absorb the cost.
 */
const ARTIFACT_MAP: Record<string, string> = {
  'دمحم': 'محمد',  // m-h-m-d → d-m-h-m after NFKC; common in this PDF
};

function fixArtifacts(word: string): string {
  return ARTIFACT_MAP[word] ?? word;
}

/** True if the majority of characters across all tokens are in Arabic blocks. */
function isMostlyArabic(tokens: string[]): boolean {
  const text = tokens.join('');
  if (!text) return false;
  let arabic = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Arabic main block + supplement + extended + presentation forms
    if (
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f) ||
      (code >= 0x08a0 && code <= 0x08ff) ||
      (code >= 0xfb50 && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      arabic++;
    }
  }
  return arabic > text.length / 2;
}

/** Extract the report date from the header "تاریخ البدایة DD-MM-YYYY". */
export function extractReportDate(lines: string[]): Date | null {
  for (const line of lines.slice(0, 10)) {
    // Match "DD-MM-YYYY" optionally preceded by the Arabic phrase
    const m = line.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

export interface ParsedPunch {
  rawEmployeeNumber: string;
  rawName: string;
  rawDepartment: string;
  recordDate: Date;
  recordTime: string;       // "HH:mm"
  punchType: 'check_in' | 'check_out';
  workCode: string | null;
  dataSource: string | null;
}

const PUNCH_KEYWORDS = {
  check_in: ['الدخول', 'دخول'],
  check_out: ['الخروج', 'خروج'],
};

/**
 * Extracts one punch record per parsable line. Returns the records in the
 * order they appear in the PDF; downstream code is responsible for grouping
 * by employee + date.
 */
export function parsePunches(lines: string[]): ParsedPunch[] {
  const out: ParsedPunch[] = [];

  for (const line of lines) {
    // A record line MUST have ISO date + HH:mm + a punch keyword
    const dateM = line.match(/(\d{4})-(\d{2})-(\d{2})/);
    const timeM = line.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!dateM || !timeM) continue;

    const punchType: 'check_in' | 'check_out' | null = PUNCH_KEYWORDS.check_out.some((k) =>
      line.includes(k),
    )
      ? 'check_out'
      : PUNCH_KEYWORDS.check_in.some((k) => line.includes(k))
        ? 'check_in'
        : null;
    if (!punchType) continue;

    // Employee number = LAST integer token on the line (after the date).
    const dateEndIdx = (dateM.index ?? 0) + dateM[0].length;
    const tail = line.slice(dateEndIdx);
    const numTokens = tail.match(/\b\d+\b/g) ?? [];
    if (numTokens.length === 0) continue;
    const rawEmployeeNumber = numTokens[numTokens.length - 1];

    // Strip the trailing employee-# token from the tail, then split into
    // tokens. The FIRST 1–2 tokens are the department (visual L→R = leftmost
    // chunk after the date in Arabic logical order is the dept), and the
    // remaining tokens are the name. We don't try to be clever about the
    // dept/name boundary — fuzzy name matching downstream tolerates noise.
    const tailWithoutEmpNum = tail.replace(new RegExp(`\\s*\\b${rawEmployeeNumber}\\b\\s*$`), '').trim();
    const tailTokens = tailWithoutEmpNum.split(/\s+/).filter(Boolean);

    // Visual L→R = REVERSE of Arabic logical order. For Arabic name tokens we
    // reverse so DB / UI / matcher all see Arabic-natural reading order.
    // Latin (English) names like "Hussain Lal Muhammad" are NOT reversed —
    // they were laid out L→R in the PDF and that already matches their
    // logical order.
    let rawDepartment = '';
    let rawName = '';
    if (tailTokens.length === 0) {
      rawDepartment = '';
      rawName = '';
    } else if (tailTokens.length === 1) {
      rawDepartment = fixArtifacts(tailTokens[0]);
      rawName = rawDepartment;
    } else {
      rawDepartment = fixArtifacts(tailTokens[0]);
      const nameTokens = tailTokens.slice(1).map(fixArtifacts);
      rawName = (isMostlyArabic(nameTokens) ? nameTokens.reverse() : nameTokens).join(' ');
    }

    const [, yyyy, mm, dd] = dateM;
    const recordDate = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
    const recordTime = `${timeM[1].padStart(2, '0')}:${timeM[2]}`;

    // Work code = first single-digit number BEFORE the time anchor.
    // Source = "الجهاز" if present, otherwise null.
    const workCodeM = line.slice(0, line.indexOf(timeM[0])).match(/\b(\d{1,2})\b/);
    const workCode = workCodeM ? workCodeM[1] : null;
    const dataSource = /الجھاز|الجهاز/.test(line) ? 'الجهاز' : null;

    out.push({
      rawEmployeeNumber,
      rawName,
      rawDepartment,
      recordDate,
      recordTime,
      punchType,
      workCode,
      dataSource,
    });
  }

  return out;
}
