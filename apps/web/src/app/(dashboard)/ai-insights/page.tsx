'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Brain, AlertTriangle, AlertCircle, CheckCircle, TrendingUp, TrendingDown,
  Loader2, Send, RefreshCw, Target, Zap, Shield, BarChart3, MessageSquare,
  Sliders,
} from 'lucide-react';
import { aiEngineApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';

const SEV_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  critical: { label: 'حرج', color: 'text-red-400', bg: 'bg-red-500/15 border-r-red-500', icon: AlertCircle },
  high: { label: 'مرتفع', color: 'text-amber-400', bg: 'bg-amber-500/15 border-r-amber-500', icon: AlertTriangle },
  medium: { label: 'متوسط', color: 'text-sky-400', bg: 'bg-sky-500/15 border-r-sky-500', icon: TrendingDown },
  low: { label: 'منخفض', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-r-emerald-500', icon: CheckCircle },
};

export default function AiInsightsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [simForm, setSimForm] = useState({ companies: '10', employees: '4', hours: '4', cardsPerHour: '4000' });
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);
  const [predictions, setPredictions] = useState<any>(null);
  const [executive, setExecutive] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'executive' | 'insights' | 'predictions' | 'ask' | 'simulate'>('executive');

  const isAuthorized = user?.role === 'admin' || user?.role === 'pm';

  const load = useCallback(async () => {
    try {
      const [insRes, predRes, execRes] = await Promise.all([
        aiEngineApi.insights(), aiEngineApi.predictions(), aiEngineApi.executive(),
      ]);
      setData(insRes.data); setPredictions(predRes.data); setExecutive(execRes.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized, load]);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAsking(true); setAnswer('');
    try {
      const { data: res } = await aiEngineApi.ask(question);
      setAnswer(res.answer);
    } catch { setAnswer('حدث خطأ. حاول مرة أخرى.'); }
    finally { setAsking(false); }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const { data: res } = await aiEngineApi.simulate({
        companies: parseInt(simForm.companies) || 0,
        employees: parseInt(simForm.employees) || 0,
        hours: parseInt(simForm.hours) || 0,
        cardsPerHour: parseInt(simForm.cardsPerHour) || 0,
      });
      setSimResult(res);
    } catch { setSimResult(null); }
    finally { setSimulating(false); }
  };

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Brain className="h-12 w-12" /><p className="text-sm">هذه الصفحة متاحة فقط للإدارة</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-gray-400">جارٍ تحليل البيانات...</p></div>
      </div>
    );
  }

  const snapshot = data?.snapshot;
  const insights = data?.insights || [];
  const summary = data?.summary || '';

  const tabs = [
    { key: 'executive' as const, label: 'الملخص التنفيذي', icon: Shield },
    { key: 'insights' as const, label: 'التحليلات', icon: Zap },
    { key: 'predictions' as const, label: 'التنبؤات', icon: TrendingUp },
    { key: 'ask' as const, label: 'اسأل النظام', icon: MessageSquare },
    { key: 'simulate' as const, label: 'المحاكاة', icon: Sliders },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/20"><Brain className="w-6 h-6 text-violet-400" /></div>
          <div><h1 className="text-2xl font-bold">محرك الذكاء الاصطناعي</h1><p className="text-gray-400 text-sm mt-0.5">تحليلات ذكية وتوصيات تنفيذية</p></div>
        </div>
        <button onClick={load} className="rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06] w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              activeTab === tab.key ? 'bg-violet-500/15 text-violet-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* ═══ EXECUTIVE TAB ═══ */}
      {activeTab === 'executive' && executive && (
        <div className="space-y-5">
          {/* Score */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 flex flex-col items-center justify-center col-span-1">
              <div className="text-5xl font-bold tabular-nums" style={{ color: executive.score >= 70 ? '#34D399' : executive.score >= 40 ? '#FBBF24' : '#F87171' }}>{executive.score}</div>
              <p className="text-sm text-gray-400 mt-2">درجة الأداء العام</p>
              <span className={cn('text-xs mt-1 px-3 py-1 rounded-full',
                executive.score >= 70 ? 'bg-emerald-500/20 text-emerald-400' : executive.score >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}>
                {executive.scoreLabel}
              </span>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-violet-500">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/15 shrink-0"><Brain className="w-5 h-5 text-violet-400" /></div>
                <div><h3 className="text-sm font-semibold text-violet-300 mb-2">الملخص التنفيذي</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{executive.summary}</p>
                  {executive.riskMessage && <p className="text-xs text-amber-400 mt-2">{executive.riskMessage}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Issues + Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-red-300 mb-3">أهم المشاكل</h3>
              {executive.topIssues.length === 0 ? <p className="text-sm text-gray-500">لا توجد مشاكل حرجة</p> : (
                <div className="space-y-2">
                  {executive.topIssues.map((issue: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02]">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div><p className="text-xs text-white font-medium">{issue.title}</p><p className="text-[10px] text-gray-400 mt-0.5">{issue.recommendation}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-emerald-300 mb-3">أهم التوصيات</h3>
              {executive.topRecommendations.length === 0 ? <p className="text-sm text-gray-500">لا توجد توصيات</p> : (
                <div className="space-y-2">
                  {executive.topRecommendations.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02]">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-300">{rec}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ INSIGHTS TAB ═══ */}
      {activeTab === 'insights' && (
        <>
          {/* AI Summary */}
          {summary && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-violet-500">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/15 shrink-0"><Brain className="w-5 h-5 text-violet-400" /></div>
                <div><h3 className="text-sm font-semibold text-violet-300 mb-1">الملخص التنفيذي</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Overview */}
          {snapshot && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'نسبة إنجاز المهام', v: `${snapshot.tasks.rate}%`, c: snapshot.tasks.rate >= 70 ? '#34D399' : '#F87171', bg: snapshot.tasks.rate >= 70 ? 'bg-emerald-500/20' : 'bg-red-500/20', icon: Target },
                { l: 'مهام متأخرة', v: formatNumber(snapshot.tasks.overdue), c: snapshot.tasks.overdue > 5 ? '#F87171' : '#34D399', bg: snapshot.tasks.overdue > 5 ? 'bg-red-500/20' : 'bg-emerald-500/20', icon: AlertTriangle },
                { l: 'إنجاز التوزيع', v: `${snapshot.achievement.latest}%`, c: snapshot.achievement.latest >= 100 ? '#34D399' : '#FBBF24', bg: snapshot.achievement.latest >= 100 ? 'bg-emerald-500/20' : 'bg-amber-500/20', icon: TrendingUp },
                { l: 'الاتجاه', v: snapshot.achievement.trend === 'improving' ? 'تحسن ↑' : snapshot.achievement.trend === 'declining' ? 'تراجع ↓' : 'مستقر', c: snapshot.achievement.trend === 'improving' ? '#34D399' : snapshot.achievement.trend === 'declining' ? '#F87171' : '#38BDF8', bg: snapshot.achievement.trend === 'declining' ? 'bg-red-500/20' : 'bg-emerald-500/20', icon: BarChart3 },
              ].map((k, i) => (
                <div key={i} className="analytics-card" style={{ borderBottom: `2px solid ${k.c}` }}>
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-xl', k.bg)}><k.icon className="w-4 h-4" style={{ color: k.c }} /></div>
                    <div><p className="text-xl font-bold text-white tabular-nums">{k.v}</p><p className="text-[10px] text-gray-400">{k.l}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Insights List */}
          {insights.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" /><p className="text-sm font-medium">لا توجد تنبيهات — الأداء جيد</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Shield className="w-4 h-4 text-violet-400" /> التحليلات والتوصيات ({insights.length})</h3>
              {insights.map((ins: any, i: number) => {
                const sev = SEV_MAP[ins.severity] || SEV_MAP.medium;
                const Icon = sev.icon;
                return (
                  <div key={i} className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px]', sev.bg)}>
                    <div className="flex items-start gap-3">
                      <div className={cn('p-2 rounded-xl shrink-0', sev.bg.split(' ')[0])}><Icon className={cn('w-4 h-4', sev.color)} /></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-white">{ins.title}</h4>
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full', sev.bg.split(' ')[0], sev.color)}>{sev.label}</span>
                        </div>
                        <div className="space-y-1.5 text-xs text-gray-400">
                          <p><span className="text-gray-500">السبب:</span> {ins.rootCause}</p>
                          <p><span className="text-gray-500">الأثر:</span> {ins.impact}</p>
                          <p className="text-emerald-400"><span className="text-gray-500">التوصية:</span> {ins.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ PREDICTIONS TAB ═══ */}
      {activeTab === 'predictions' && predictions && (
        <div className="space-y-4">
          {predictions.message ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center">
              <TrendingUp className="w-10 h-10 text-gray-500 mx-auto mb-3" /><p className="text-sm text-gray-400">{predictions.message}</p>
            </div>
          ) : (<>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px]"
              style={{ borderRightColor: predictions.risk ? '#F87171' : '#34D399' }}>
              <p className="text-sm text-gray-300">{predictions.riskMessage}</p>
              <p className="text-xs text-gray-500 mt-1">الاتجاه: {predictions.trend === 'improving' ? 'تحسن ↑' : predictions.trend === 'declining' ? 'تراجع ↓' : 'مستقر →'} | متوسط ٣ أيام: {predictions.last3Avg}% | متوسط ٧ أيام: {predictions.last7Avg}%</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {predictions.predictions.map((p: any) => (
                <div key={p.day} className="analytics-card text-center">
                  <p className="text-[10px] text-gray-500">{p.label}</p>
                  <p className={cn('text-lg font-bold tabular-nums mt-1', p.predictedAchievement >= 100 ? 'text-emerald-400' : p.predictedAchievement >= 85 ? 'text-amber-400' : 'text-red-400')}>
                    {p.predictedAchievement}%
                  </p>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full mt-1 inline-block',
                    p.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' : p.confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400')}>
                    {p.confidence === 'high' ? 'ثقة عالية' : p.confidence === 'medium' ? 'متوسطة' : 'منخفضة'}
                  </span>
                </div>
              ))}
            </div>
          </>)}
        </div>
      )}

      {/* ═══ ASK TAB ═══ */}
      {activeTab === 'ask' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-3">اسأل النظام بلغتك</h3>
            <div className="flex gap-3">
              <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="مثال: ما هي نسبة الانحراف هذا الأسبوع؟" className="input-field flex-1 text-sm" />
              <button onClick={handleAsk} disabled={asking || !question.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">
                {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {['ما هو أداء التوزيع؟', 'أي مسار متأخر؟', 'كم المهام المتأخرة؟', 'ما هو اتجاه الأداء؟'].map((q) => (
                <button key={q} onClick={() => { setQuestion(q); }} className="text-[10px] px-3 py-1 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors">{q}</button>
              ))}
            </div>
          </div>
          {answer && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-violet-500">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/15 shrink-0"><Brain className="w-5 h-5 text-violet-400" /></div>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SIMULATE TAB ═══ */}
      {activeTab === 'simulate' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white mb-3">محاكاة سيناريو — ماذا لو؟</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { k: 'companies', l: 'عدد الشركات' },
                { k: 'employees', l: 'عدد الأخصائيين' },
                { k: 'hours', l: 'ساعات العمل' },
                { k: 'cardsPerHour', l: 'بطاقات/أخصائي/ساعة' },
              ].map((f) => (
                <div key={f.k}>
                  <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                  <input type="number" value={(simForm as any)[f.k]} className="input-field text-sm"
                    onChange={(e) => setSimForm({ ...simForm, [f.k]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={handleSimulate} disabled={simulating} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">
                {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تشغيل المحاكاة'}
              </button>
            </div>
          </div>
          {simResult && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="analytics-card" style={{ borderBottom: '2px solid #8B5CF6' }}>
                <p className="text-2xl font-bold text-white tabular-nums">{formatNumber(simResult.expectedCapacity)}</p>
                <p className="text-[10px] text-gray-400">الطاقة المتوقعة</p>
              </div>
              <div className="analytics-card" style={{ borderBottom: `2px solid ${simResult.achievementPct >= 100 ? '#34D399' : '#FBBF24'}` }}>
                <p className={cn('text-2xl font-bold tabular-nums', simResult.achievementPct >= 100 ? 'text-emerald-400' : 'text-amber-400')}>{simResult.achievementPct}%</p>
                <p className="text-[10px] text-gray-400">نسبة الإنجاز المتوقعة</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-gray-300">{simResult.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
