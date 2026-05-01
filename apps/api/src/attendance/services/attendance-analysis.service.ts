import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../common/prisma.service';
import type { PdfAttendanceStatus } from '@prisma/client';

/**
 * Persists a Claude-generated analysis for a single attendance upload.
 *
 * Why a separate service (rather than reusing `ClaudeService.chatWithTools`):
 * we need a one-shot structured-JSON call, no tool loop. Same direct-SDK
 * pattern as `AIAnalyzerService` (invoice analyzer).
 *
 * Input to the model is the *structured* daily summaries (already produced by
 * `PdfUploadService.ingest` → `PdfDailyAttendanceSummary`), NOT the raw PDF
 * text — the analyzer doesn't re-parse, it interprets.
 */

type CityRow = {
  city: 'مكة المكرمة' | 'المدينة المنورة' | 'مشترك';
  employeeCount: number;
  attendanceRate: number;
  observation?: string;
};

type ScheduleComplianceJson = {
  withinSchedule: number; // worksByCharter=true count
  outsideSchedule: number; // worksByCharter=false count
  complianceRate: number; // % of within-schedule employees marked present
  punctualityWithinSchedule: number; // % of within-schedule arrivals on time vs scheduledCheckIn
  deviations: Array<{ name: string; track?: string; issue: string; severity: 'low' | 'medium' | 'high' }>;
  observation?: string;
};

type AnalysisJson = {
  executiveSummary: string;
  keyInsights: Array<{ title: string; value: string; trend: 'up' | 'down' | 'stable'; severity?: string }>;
  attendanceRate: number;
  punctualityRate: number;
  averageWorkHours: number;
  totalLateMinutes: number;
  trackAnalysis: Array<{ trackName: string; attendanceRate: number; absences: number; recommendations?: string }>;
  absencePatterns: Array<{ pattern: string; frequency: string; employees?: string[]; severity?: string }>;
  topPerformers: Array<{ name: string; score?: string | number; reason?: string }>;
  needsAttention: Array<{ name: string; issue?: string; severity?: string }>;
  recommendations: Array<{ priority: 'high' | 'medium' | 'low'; title: string; description: string; actionItems?: string[] }>;
  riskFlags: Array<{ type: string; level: 'low' | 'medium' | 'high'; description: string; affectedCount: number }>;
  byCity: CityRow[];
  scheduleCompliance: ScheduleComplianceJson;
};

@Injectable()
export class AttendanceAnalysisService {
  private readonly logger = new Logger(AttendanceAnalysisService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.logger.warn('ANTHROPIC_API_KEY not set — attendance AI analysis will return 503');
    }
  }

  async getAnalysis(uploadId: string) {
    const existing = await this.prisma.pdfAttendanceAiAnalysis.findUnique({
      where: { uploadId },
    });
    if (!existing) return null;
    return { ...existing, isCached: true };
  }

  async hasAnalysis(uploadId: string): Promise<boolean> {
    const count = await this.prisma.pdfAttendanceAiAnalysis.count({ where: { uploadId } });
    return count > 0;
  }

  async hasAnalysisMany(uploadIds: string[]): Promise<Record<string, boolean>> {
    if (uploadIds.length === 0) return {};
    const rows = await this.prisma.pdfAttendanceAiAnalysis.findMany({
      where: { uploadId: { in: uploadIds } },
      select: { uploadId: true },
    });
    const present = new Set(rows.map((r) => r.uploadId));
    return uploadIds.reduce<Record<string, boolean>>((acc, id) => {
      acc[id] = present.has(id);
      return acc;
    }, {});
  }

  async getOrCreateAnalysis(uploadId: string, userId: string, forceReanalyze = false) {
    const existing = await this.prisma.pdfAttendanceAiAnalysis.findUnique({
      where: { uploadId },
    });
    if (existing && !forceReanalyze) {
      this.logger.log(`✅ cached analysis hit for upload=${uploadId}`);
      return { ...existing, isCached: true };
    }

    const upload = await this.prisma.pdfAttendanceUpload.findUnique({
      where: { id: uploadId },
      include: {
        summaries: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                track: true,
                trackDetail: true,
                shiftType: true,
                center: true,
                scheduledCheckIn: true,
                scheduledCheckOut: true,
                worksByCharter: true,
              },
            },
          },
        },
      },
    });
    if (!upload) throw new NotFoundException('الرفعة غير موجودة');

    if (!this.client) {
      throw new ServiceUnavailableException(
        'تحليل الذكاء الاصطناعي غير متاح حالياً: ANTHROPIC_API_KEY غير مضبوط على الخادم.',
      );
    }

    const stats = computeStats(upload.summaries);
    const model = this.config.get<string>('ANTHROPIC_MODEL_DEFAULT') || 'claude-sonnet-4-5';

    const startedAt = Date.now();
    const ai = await this.callClaude(model, upload, stats);
    const processingTimeMs = Date.now() - startedAt;

    const data = {
      executiveSummary: ai.executiveSummary,
      keyInsights: ai.keyInsights as any,
      attendanceRate: clamp01(ai.attendanceRate),
      punctualityRate: clamp01(ai.punctualityRate),
      averageWorkHours: round2(ai.averageWorkHours),
      totalLateMinutes: Math.max(0, Math.round(ai.totalLateMinutes ?? 0)),
      trackAnalysis: ai.trackAnalysis as any,
      absencePatterns: ai.absencePatterns as any,
      topPerformers: ai.topPerformers as any,
      needsAttention: ai.needsAttention as any,
      recommendations: ai.recommendations as any,
      riskFlags: ai.riskFlags as any,
      byCity: ai.byCity as any,
      scheduleCompliance: ai.scheduleCompliance as any,
      aiModel: model,
      processingTimeMs,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      analyzedById: userId,
      analyzedAt: new Date(),
    };

    if (existing) {
      const updated = await this.prisma.pdfAttendanceAiAnalysis.update({
        where: { uploadId },
        data: {
          ...data,
          version: existing.version + 1,
          previousVersionId: existing.id,
        },
      });
      this.logger.log(`♻ refreshed analysis for upload=${uploadId} v${updated.version} (${processingTimeMs}ms)`);
      return { ...updated, isCached: false };
    }

    const created = await this.prisma.pdfAttendanceAiAnalysis.create({
      data: { uploadId, ...data },
    });
    this.logger.log(`✨ created analysis for upload=${uploadId} (${processingTimeMs}ms)`);
    return { ...created, isCached: false };
  }

  async deleteAnalysis(uploadId: string) {
    const result = await this.prisma.pdfAttendanceAiAnalysis.deleteMany({ where: { uploadId } });
    return { deleted: result.count };
  }

  // ─── Claude call ───────────────────────────────────────────────────────

  private async callClaude(
    model: string,
    upload: { id: string; fileName: string; reportDate: Date; totalRecords: number; matchedCount: number; unmatchedCount: number },
    stats: ReturnType<typeof computeStats>,
  ): Promise<AnalysisJson & { inputTokens: number; outputTokens: number }> {
    const systemPrompt = `أنت محلل بيانات حضور خبير في منصة "رؤية" (مشروع نسك EVC). تتلقى ملخصاً يومياً لحضور الموظفين بصيغة JSON منظمة، ومهمتك إنتاج تحليل تنفيذي بالعربية وفق المخطط المحدد.

قواعد إلزامية:
- أعِد JSON فقط، بدون أي نص خارج JSON.
- جميع الحقول النصية بالعربية الفصيحة المهنية.
- الأرقام واقعية ومستندة على البيانات، لا تخترع موظفين أو مسارات.
- النسب بين 0 و 100. الساعات بالعشري (مثل 8.5).
- لا تستخدم emoji.

المخطط (الأنواع كالتالي):
{
  "executiveSummary": string,
  "keyInsights": [{"title": string, "value": string, "trend": "up"|"down"|"stable", "severity": "info"|"warning"|"critical"}],
  "attendanceRate": number,
  "punctualityRate": number,
  "averageWorkHours": number,
  "totalLateMinutes": number,
  "trackAnalysis": [{"trackName": string, "attendanceRate": number, "absences": number, "recommendations": string}],
  "absencePatterns": [{"pattern": string, "frequency": string, "employees": [string], "severity": "low"|"medium"|"high"}],
  "topPerformers": [{"name": string, "score": string, "reason": string}],
  "needsAttention": [{"name": string, "issue": string, "severity": "low"|"medium"|"high"}],
  "recommendations": [{"priority": "high"|"medium"|"low", "title": string, "description": string, "actionItems": [string]}],
  "riskFlags": [{"type": string, "level": "low"|"medium"|"high", "description": string, "affectedCount": number}],
  "byCity": [{"city": "مكة المكرمة"|"المدينة المنورة"|"مشترك", "employeeCount": number, "attendanceRate": number, "observation": string}],
  "scheduleCompliance": {
    "withinSchedule": number,
    "outsideSchedule": number,
    "complianceRate": number,
    "punctualityWithinSchedule": number,
    "deviations": [{"name": string, "track": string, "issue": string, "severity": "low"|"medium"|"high"}],
    "observation": string
  }
}

ملاحظات على الكراسة (booklet/charter):
- "ضمن الكراسة" يعني worksByCharter=true: الموظف ملتزم بالجدول الرسمي وله وقت حضور وانصراف محددان.
- "خارج الكراسة" يعني worksByCharter=false: لا يندرج تحت الجدول الرسمي (On Call، أونلاين، بدون وقت محدد، إلخ).
- في deviations اذكر فقط الموظفين "ضمن الكراسة" الذين خرجوا فعلاً عن جدولهم (تأخر > 15 دقيقة، أو غياب، أو ساعات ناقصة).
- byCity: استخدم العدّ الفعلي من computedStats.byCity ولا تخترع موظفين خارج القائمة.`;

    const userPayload = {
      file: { name: upload.fileName, reportDate: upload.reportDate.toISOString().slice(0, 10) },
      totals: {
        totalRecords: upload.totalRecords,
        matchedCount: upload.matchedCount,
        unmatchedCount: upload.unmatchedCount,
      },
      computedStats: stats,
    };

    const userPrompt = `ملف الحضور التالي مُحلَّل مسبقاً إلى ملخصات يومية لكل موظف. أنتج التحليل التنفيذي.

البيانات:
${JSON.stringify(userPayload, null, 2)}`;

    const res = await this.client!.messages.create({
      model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = (res.content.find((b) => b.type === 'text') as any)?.text ?? '';
    const parsed = parseJsonStrict(text);
    if (!parsed) {
      throw new Error('الذكاء الاصطناعي أعاد ردّاً غير قابل للقراءة. حاول مرة أخرى.');
    }

    // For byCity / scheduleCompliance we trust the deterministic stats over the
    // model — the model only contributes the prose `observation` / `deviations`.
    // This matches the user's expectation that headcount numbers reflect the
    // seeded charter, not what the LLM thinks it saw.
    const byCityFromStats = stats.byCity.map((c) => {
      const aiRow = arr(parsed.byCity).find((x: any) => x?.city === c.city);
      return {
        city: c.city,
        employeeCount: c.employeeCount,
        attendanceRate: c.attendanceRate,
        observation: aiRow?.observation ? String(aiRow.observation).slice(0, 500) : undefined,
      };
    });

    const sc = parsed.scheduleCompliance ?? {};
    const scheduleCompliance: ScheduleComplianceJson = {
      withinSchedule: stats.bookletCompliance.withinSchedule,
      outsideSchedule: stats.bookletCompliance.outsideSchedule,
      complianceRate: stats.bookletCompliance.complianceRate,
      punctualityWithinSchedule: stats.bookletCompliance.punctualityWithinSchedule,
      deviations: arr(sc.deviations).slice(0, 30).map((d: any) => {
        const sev: 'low' | 'medium' | 'high' =
          d?.severity === 'low' || d?.severity === 'high' ? d.severity : 'medium';
        return {
          name: String(d?.name ?? '').slice(0, 120),
          track: d?.track ? String(d.track).slice(0, 80) : undefined,
          issue: String(d?.issue ?? '').slice(0, 240),
          severity: sev,
        };
      }),
      observation: sc.observation ? String(sc.observation).slice(0, 500) : undefined,
    };

    return {
      executiveSummary: String(parsed.executiveSummary ?? '').slice(0, 4000),
      keyInsights: arr(parsed.keyInsights),
      attendanceRate: num(parsed.attendanceRate),
      punctualityRate: num(parsed.punctualityRate),
      averageWorkHours: num(parsed.averageWorkHours),
      totalLateMinutes: int(parsed.totalLateMinutes),
      trackAnalysis: arr(parsed.trackAnalysis),
      absencePatterns: arr(parsed.absencePatterns),
      topPerformers: arr(parsed.topPerformers),
      needsAttention: arr(parsed.needsAttention),
      recommendations: arr(parsed.recommendations),
      riskFlags: arr(parsed.riskFlags),
      byCity: byCityFromStats,
      scheduleCompliance,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────

type SummaryRow = {
  status: PdfAttendanceStatus;
  totalHours: number | null;
  firstCheckIn: string | null;
  flags: string[];
  employee: {
    id: string;
    fullName: string;
    track: string;
    trackDetail: string | null;
    shiftType: string;
    center: string | null;
    scheduledCheckIn: string | null;
    scheduledCheckOut: string | null;
    worksByCharter: boolean;
  };
};

const CITY_LABELS: Record<string, 'مكة المكرمة' | 'المدينة المنورة' | 'مشترك'> = {
  makkah: 'مكة المكرمة',
  madinah: 'المدينة المنورة',
  shared: 'مشترك',
};

function computeStats(summaries: SummaryRow[]) {
  const total = summaries.length;
  const present = summaries.filter((s) => s.status === 'present' || s.status === 'on_call_present').length;
  const absent = summaries.filter((s) => s.status === 'absent').length;
  const incompleteHours = summaries.filter((s) => s.status === 'incomplete_hours').length;
  const checkInOnly = summaries.filter((s) => s.status === 'check_in_only' || s.status === 'on_call_check_in_only').length;
  const checkOutOnly = summaries.filter((s) => s.status === 'check_out_only' || s.status === 'on_call_check_out_only').length;
  const onCallNoVisit = summaries.filter((s) => s.status === 'on_call_no_visit').length;

  const hours = summaries.map((s) => s.totalHours ?? 0).filter((h) => h > 0);
  const totalHours = hours.reduce((a, b) => a + b, 0);
  const avgHours = hours.length ? totalHours / hours.length : 0;

  const byTrack: Record<string, { total: number; present: number; absent: number; incomplete: number }> = {};
  for (const s of summaries) {
    const t = s.employee.track || 'غير محدد';
    if (!byTrack[t]) byTrack[t] = { total: 0, present: 0, absent: 0, incomplete: 0 };
    byTrack[t].total += 1;
    if (s.status === 'present' || s.status === 'on_call_present') byTrack[t].present += 1;
    if (s.status === 'absent') byTrack[t].absent += 1;
    if (s.status === 'incomplete_hours') byTrack[t].incomplete += 1;
  }

  // ─── By city (مكة / المدينة / مشترك) — derived from PdfAttendanceCenter ───
  const byCity: Record<string, { total: number; present: number; absent: number }> = {};
  for (const s of summaries) {
    const c = s.employee.center || 'shared';
    if (!byCity[c]) byCity[c] = { total: 0, present: 0, absent: 0 };
    byCity[c].total += 1;
    if (s.status === 'present' || s.status === 'on_call_present') byCity[c].present += 1;
    if (s.status === 'absent') byCity[c].absent += 1;
  }

  // ─── Booklet/charter compliance ───
  const within = summaries.filter((s) => s.employee.worksByCharter);
  const outside = summaries.filter((s) => !s.employee.worksByCharter);
  const withinPresent = within.filter((s) => s.status === 'present' || s.status === 'on_call_present').length;
  const withinAbsent = within.filter((s) => s.status === 'absent').length;
  const withinIncomplete = within.filter((s) => s.status === 'incomplete_hours').length;

  // Punctuality vs scheduled check-in (within-schedule employees only).
  let punctualWithin = 0;
  let punctualWithinDenom = 0;
  for (const s of within) {
    if (!s.employee.scheduledCheckIn || !s.firstCheckIn) continue;
    const lateMin = lateMinutes(s.firstCheckIn, s.employee.scheduledCheckIn);
    if (lateMin === null) continue;
    punctualWithinDenom += 1;
    if (lateMin <= 15) punctualWithin += 1; // 15-min grace
  }

  // Per-employee snapshots for the model — capped at 200, includes booklet
  // fields so the LLM can reason about deviations and call out specific names.
  const employees = summaries.slice(0, 200).map((s) => {
    const lateMin = s.employee.scheduledCheckIn && s.firstCheckIn
      ? lateMinutes(s.firstCheckIn, s.employee.scheduledCheckIn)
      : null;
    return {
      name: s.employee.fullName,
      track: s.employee.track,
      city: CITY_LABELS[s.employee.center || 'shared'] ?? 'مشترك',
      shiftType: s.employee.shiftType,
      worksByCharter: s.employee.worksByCharter,
      scheduledCheckIn: s.employee.scheduledCheckIn,
      scheduledCheckOut: s.employee.scheduledCheckOut,
      firstCheckIn: s.firstCheckIn,
      lateMinutes: lateMin,
      status: s.status,
      hours: s.totalHours,
      flags: s.flags,
    };
  });

  return {
    total,
    present,
    absent,
    incompleteHours,
    checkInOnly,
    checkOutOnly,
    onCallNoVisit,
    attendanceRate: total ? +((present / total) * 100).toFixed(2) : 0,
    averageWorkHours: +avgHours.toFixed(2),
    byTrack: Object.entries(byTrack).map(([trackName, v]) => ({ trackName, ...v })),
    byCity: Object.entries(byCity).map(([c, v]) => ({
      city: CITY_LABELS[c] ?? 'مشترك',
      employeeCount: v.total,
      present: v.present,
      absent: v.absent,
      attendanceRate: v.total ? +((v.present / v.total) * 100).toFixed(2) : 0,
    })),
    bookletCompliance: {
      withinSchedule: within.length,
      outsideSchedule: outside.length,
      withinPresent,
      withinAbsent,
      withinIncomplete,
      complianceRate: within.length ? +((withinPresent / within.length) * 100).toFixed(2) : 0,
      punctualityWithinSchedule: punctualWithinDenom
        ? +((punctualWithin / punctualWithinDenom) * 100).toFixed(2)
        : 0,
    },
    employees,
  };
}

// "07:00" or "07:00:00" → minutes since midnight, else null.
function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function lateMinutes(actual: string | null, scheduled: string | null): number | null {
  const a = toMinutes(actual);
  const s = toMinutes(scheduled);
  if (a === null || s === null) return null;
  return Math.max(0, a - s);
}

function parseJsonStrict(raw: string): any | null {
  if (!raw) return null;
  // Strip ```json fences if Claude wrapped the output.
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: take the first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function int(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, +v.toFixed(2)));
}
function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return +v.toFixed(2);
}
