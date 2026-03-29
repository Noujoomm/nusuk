'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Shield, AlertTriangle, AlertCircle, CheckCircle, TrendingUp, TrendingDown,
  Loader2, RefreshCw, Target, Zap, BarChart3, Clock, Brain, ChevronLeft,
} from 'lucide-react';
import { aiEngineApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';

function ScoreRing({ value, size = 100, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  const color = value >= 70 ? '#34D399' : value >= 40 ? '#FBBF24' : '#F87171';
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} strokeLinecap="round"
            className="transition-all duration-1000" style={{ filter: `drop-shadow(0 0 6px ${color}66)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-white">{value}</span>
        </div>
      </div>
      {label && <p className="text-xs text-gray-400 mt-2">{label}</p>}
    </div>
  );
}

const riskColor = (v: number) => v >= 70 ? 'text-red-400' : v >= 40 ? 'text-amber-400' : 'text-emerald-400';
const riskBg = (v: number) => v >= 70 ? 'bg-red-500/15' : v >= 40 ? 'bg-amber-500/15' : 'bg-emerald-500/15';

export default function CommandCenterPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const { data: d } = await aiEngineApi.commandCenter(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.role === 'admin' || user?.role === 'pm') load(); }, [user, load]);

  if (!(user?.role === 'admin' || user?.role === 'pm')) {
    return <div className="flex items-center justify-center py-20 text-gray-400"><Shield className="w-12 h-12" /></div>;
  }
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/20"><Brain className="w-6 h-6 text-violet-400" /></div>
          <div><h1 className="text-2xl font-bold">مركز القيادة الذكي</h1><p className="text-gray-400 text-sm">تشخيص — تنبؤ — توصيات</p></div>
        </div>
        <button onClick={load} className="rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> تحديث</button>
      </div>

      {/* ═══ TOP: Global KPIs ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center">
          <ScoreRing value={data.globalCompletion} label="الإنجاز العام" />
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center">
          <ScoreRing value={100 - data.globalRisk} label="مؤشر الاستقرار" />
          <span className={cn('text-xs mt-1 px-3 py-1 rounded-full', riskBg(data.globalRisk), riskColor(data.globalRisk))}>
            المخاطر: {data.globalRiskLabel}
          </span>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <h3 className="text-sm font-semibold text-white mb-2">التنبؤ — ٧ أيام</h3>
          {data.predictions.length > 0 ? (
            <div className="space-y-1.5">
              {data.predictions.slice(0, 5).map((p: any) => (
                <div key={p.day} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{p.label}</span>
                  <span className={cn('text-sm font-bold tabular-nums', p.predictedAchievement >= 85 ? 'text-emerald-400' : 'text-red-400')}>{p.predictedAchievement}%</span>
                </div>
              ))}
              {data.predictionsMessage && <p className="text-[10px] text-amber-400 mt-2">{data.predictionsMessage}</p>}
            </div>
          ) : <p className="text-sm text-gray-500">بيانات غير كافية</p>}
        </div>
      </div>

      {/* ═══ PRESCRIPTIVE: Actions Panel ═══ */}
      {data.topActions.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-violet-500">
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2"><Zap className="w-4 h-4" /> التوصيات التنفيذية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.topActions.map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02]">
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', riskBg(a.risk), riskColor(a.risk))}>{i + 1}</div>
                <div><p className="text-xs text-white">{a.action}</p><p className="text-[10px] text-gray-500 mt-0.5">{a.track}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TRACK INTELLIGENCE CARDS ═══ */}
      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mt-8"><Target className="w-4 h-4 text-violet-400" /> تحليل المسارات</h3>
      <div className="space-y-4">
        {data.tracks.map((t: any) => (
          <div key={t.trackId} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5" style={{ borderRight: `3px solid ${t.trackColor}` }}>
            {/* Track header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: t.trackColor }} />
                <h3 className="text-base font-bold text-white">{t.trackName}</h3>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full', riskBg(t.risk), riskColor(t.risk))}>مخاطر: {t.riskLabel}</span>
              </div>
              <span className="text-sm font-bold tabular-nums text-white">{t.weightedCompletion}%</span>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              {[
                { l: 'الإنجاز', v: `${t.completionRate}%`, c: t.completionRate >= 70 ? '#34D399' : '#F87171' },
                { l: 'في الوقت', v: `${t.onTimeRate}%`, c: t.onTimeRate >= 80 ? '#34D399' : '#FBBF24' },
                { l: 'متوسط الأيام', v: `${t.avgDays}`, c: t.avgDays <= 5 ? '#34D399' : '#F87171' },
                { l: 'متأخرة', v: String(t.delayed), c: t.delayed > 0 ? '#F87171' : '#34D399' },
                { l: 'عالية متأخرة', v: `${t.highPriDelayRate}%`, c: t.highPriDelayRate > 20 ? '#F87171' : '#34D399' },
                { l: 'تقارير ٧ أيام', v: String(t.reportsLast7), c: t.reportsLast7 >= 3 ? '#34D399' : '#F87171' },
              ].map((k, i) => (
                <div key={i} className="text-center p-2 rounded-lg bg-white/[0.02]">
                  <p className="text-base font-bold tabular-nums" style={{ color: k.c }}>{k.v}</p>
                  <p className="text-[9px] text-gray-500">{k.l}</p>
                </div>
              ))}
            </div>

            {/* Performance DNA */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { l: 'السرعة', v: t.speedScore },
                { l: 'الانضباط', v: t.disciplineScore },
                { l: 'التنفيذ', v: t.executionScore },
                { l: 'المخاطر', v: 100 - t.riskScore },
              ].map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-gray-500">{d.l}</span>
                    <span className="text-[10px] text-gray-400 tabular-nums">{d.v}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${d.v}%`,
                      background: d.v >= 70 ? '#34D399' : d.v >= 40 ? '#FBBF24' : '#F87171',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Diagnostic + Prescriptive */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {t.rootCauses.length > 0 && (
                <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3">
                  <h4 className="text-[10px] text-red-400 font-semibold mb-1.5">التشخيص — لماذا؟</h4>
                  {t.rootCauses.map((c: string, i: number) => (
                    <p key={i} className="text-[11px] text-gray-300 flex items-start gap-1.5 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />{c}
                    </p>
                  ))}
                </div>
              )}
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3">
                <h4 className="text-[10px] text-emerald-400 font-semibold mb-1.5">التوصيات — ماذا نفعل؟</h4>
                {t.actions.map((a: string, i: number) => (
                  <p key={i} className="text-[11px] text-gray-300 flex items-start gap-1.5 mt-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />{a}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
