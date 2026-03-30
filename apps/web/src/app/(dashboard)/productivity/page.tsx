'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Brain, Shield, AlertTriangle, AlertCircle, CheckCircle, TrendingUp,
  Loader2, RefreshCw, Target, Zap, BarChart3, Clock, Send, Star,
  AlertOctagon, Eye,
} from 'lucide-react';
import { productivityApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';

function Ring({ value, size = 100, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  const color = value >= 75 ? '#34D399' : value >= 60 ? '#FBBF24' : '#F87171';
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c} strokeLinecap="round"
            className="transition-all duration-1000" style={{ filter: `drop-shadow(0 0 6px ${color}66)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-white">{value}%</span>
        </div>
      </div>
      {label && <p className="text-xs text-gray-400 mt-2">{label}</p>}
    </div>
  );
}

const Q_ICONS: Record<string, React.ElementType> = { '⭐': Star, '🔴': AlertOctagon, '🟡': Eye, '⚪': Eye };
const Q_COLORS: Record<string, string> = { '⭐': 'text-emerald-400', '🔴': 'text-red-400', '🟡': 'text-amber-400', '⚪': 'text-gray-400' };

export default function ProductivityPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'copilot'>('dashboard');

  const isAuth = user?.role === 'admin' || user?.role === 'pm';
  const load = useCallback(async () => {
    try { const { data: d } = await productivityApi.getAll(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isAuth) load(); }, [isAuth, load]);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAsking(true); setAnswer('');
    try { const { data: r } = await productivityApi.copilot(question); setAnswer(r.answer); }
    catch { setAnswer('حدث خطأ'); } finally { setAsking(false); }
  };

  if (!isAuth) return <div className="flex items-center justify-center py-20 text-gray-400"><Shield className="w-12 h-12" /></div>;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-violet-400" /></div>;
  if (!data) return null;

  const tracks = data.tracks || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/20"><Brain className="w-6 h-6 text-violet-400" /></div>
          <div><h1 className="text-2xl font-bold">محرك الإنتاجية</h1><p className="text-gray-400 text-sm">النموذج المُعتمد v2 — تحليل + تشخيص + تنبؤ</p></div>
        </div>
        <div className="flex gap-2">
          {[{ k: 'dashboard' as const, l: 'اللوحة' }, { k: 'copilot' as const, l: 'Copilot' }].map((t) => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all',
              activeTab === t.k ? 'bg-violet-500/15 text-violet-400' : 'bg-white/5 text-gray-400 hover:bg-white/10')}>{t.l}</button>
          ))}
          <button onClick={load} className="rounded-xl bg-white/5 px-3 py-2 text-gray-300 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {activeTab === 'dashboard' && (<>
        {/* Project KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center">
            <Ring value={data.projectProductivity} label="إنتاجية المشروع" />
          </div>
          {[
            { l: 'مسارات خضراء', v: data.greenTracks, c: '#34D399', icon: CheckCircle },
            { l: 'مسارات حمراء', v: data.redTracks, c: '#F87171', icon: AlertTriangle },
            { l: 'مهام معرضة للخطر', v: data.totalAtRisk, c: data.totalAtRisk > 0 ? '#F87171' : '#34D399', icon: AlertCircle },
          ].map((k, i) => (
            <div key={i} className="analytics-card flex items-center gap-3" style={{ borderBottom: `2px solid ${k.c}` }}>
              <k.icon className="w-5 h-5" style={{ color: k.c }} />
              <div><p className="text-2xl font-bold text-white tabular-nums">{k.v}</p><p className="text-[10px] text-gray-400">{k.l}</p></div>
            </div>
          ))}
        </div>

        {/* Track Cards */}
        {tracks.map((t: any) => {
          const qChar = t.quadrant.charAt(0);
          const QIcon = Q_ICONS[qChar] || Eye;
          return (
            <div key={t.trackId} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5" style={{ borderRight: `3px solid ${t.trackColor}` }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: t.trackColor }} />
                  <h3 className="text-base font-bold text-white">{t.trackName}</h3>
                  <span className={cn('text-xs', Q_COLORS[qChar] || 'text-gray-400')}>{t.quadrant}</span>
                </div>
                <span className={cn('text-xl font-bold tabular-nums', t.productivity >= 75 ? 'text-emerald-400' : t.productivity >= 60 ? 'text-amber-400' : 'text-red-400')}>{t.productivity}%</span>
              </div>

              {/* 8 diagnostic indicators */}
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-4">
                {[
                  { l: 'في الوقت', v: `${t.onTimeRate}%` },
                  { l: 'اعتماد أول', v: `${t.firstApprovalRate}%` },
                  { l: 'بنود الاتفاقية', v: `${t.agreementCompletionRate}%` },
                  { l: 'التميز', v: `${t.excellenceRate}%` },
                  { l: 'متأخرة', v: String(t.overdueCount) },
                  { l: 'محظورة', v: String(t.blockedCount) },
                  { l: 'Velocity', v: t.velocityTrend },
                  { l: 'Burn', v: `${t.burnWeeks} أسبوع` },
                ].map((d, i) => (
                  <div key={i} className="text-center p-2 rounded-lg bg-white/[0.02]">
                    <p className="text-sm font-bold text-white tabular-nums">{d.v}</p>
                    <p className="text-[8px] text-gray-500">{d.l}</p>
                  </div>
                ))}
              </div>

              {/* At-risk tasks */}
              {t.atRiskTasks.length > 0 && (
                <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3 mb-3">
                  <h4 className="text-[10px] text-red-400 font-semibold mb-1">مهام معرضة للخطر</h4>
                  {t.atRiskTasks.map((r: any) => (
                    <p key={r.id} className="text-[11px] text-gray-300 mt-1">• {r.title} — أهمية {r.importance} — تقدم {r.progress}%</p>
                  ))}
                </div>
              )}

              {/* Blocked */}
              {t.blockedReasons.length > 0 && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 mb-3">
                  <h4 className="text-[10px] text-amber-400 font-semibold mb-1">عوائق نشطة</h4>
                  {t.blockedReasons.map((r: string, i: number) => (
                    <p key={i} className="text-[11px] text-gray-300 mt-1">• {r}</p>
                  ))}
                </div>
              )}

              {/* Quadrant action */}
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-3">
                <p className="text-[11px] text-violet-300"><span className="font-semibold">الإجراء:</span> {t.quadrantAction}</p>
              </div>
            </div>
          );
        })}
      </>)}

      {/* Copilot Tab */}
      {activeTab === 'copilot' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-3">مساعد رؤية للإنتاجية</h3>
            <div className="flex gap-3">
              <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="حلّل مسار التوزيع / وين المشكلة؟ / اعمل تقرير..." className="input-field flex-1 text-sm" />
              <button onClick={handleAsk} disabled={asking || !question.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">
                {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {['حلّل جميع المسارات', 'وين المشكلة؟', 'اعمل تقرير للعرض', 'قارن المسارات', 'المهام المعرضة للخطر'].map((q) => (
                <button key={q} onClick={() => setQuestion(q)} className="text-[10px] px-3 py-1 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">{q}</button>
              ))}
            </div>
          </div>
          {answer && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-violet-500">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/15 shrink-0"><Brain className="w-5 h-5 text-violet-400" /></div>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap flex-1">{answer}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
