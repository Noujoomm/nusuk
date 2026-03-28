'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  Plus, Trash2, Loader2, AlertTriangle, CheckCircle, TrendingUp,
  Target, Activity, BarChart3, Shield, X, AlertCircle, ArrowLeftRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { distributionApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const DURATION = 4;
const SPECIALISTS = 4;

const ACH_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: 'ممتاز', color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
  on_track: { label: 'على المسار', color: 'text-sky-300', bg: 'bg-sky-500/20' },
  warning: { label: 'تحذير', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  critical: { label: 'حرج', color: 'text-red-300', bg: 'bg-red-500/20' },
};

const DEV_SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'منخفض', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  medium: { label: 'متوسط', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  high: { label: 'مرتفع', color: 'text-red-400', bg: 'bg-red-500/20' },
};

function Ring({ value, size = 100 }: { value: number; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  const clamped = Math.min(150, Math.max(0, value));
  const color = value >= 100 ? '#34D399' : value >= 95 ? '#38BDF8' : value >= 85 ? '#FBBF24' : '#F87171';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - (clamped / 150) * c} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-white">{value}%</span>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, color, children }: { title: string; icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: `${color}20` }}><Icon className="w-5 h-5" style={{ color }} /></div>
        <h2 className="text-base font-bold text-white">{title}</h2>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, bg }: { label: string; value: string | number; icon: React.ElementType; color: string; bg: string }) {
  return (
    <div className="analytics-card" style={{ borderBottom: `2px solid ${color}` }}>
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl', bg)}><Icon className="w-5 h-5" style={{ color }} /></div>
        <div><p className="text-xl font-bold text-white tabular-nums">{value}</p><p className="text-[11px] text-gray-400">{label}</p></div>
      </div>
    </div>
  );
}

export default function DistributionDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ gregorianDate: '', hijriDate: '', companies: '', batches: '', cardsPerHour: '', platformActual: '', factoryActual: '', distributionActual: '' });

  const load = useCallback(async () => {
    try { const { data: d } = await distributionApi.dashboard(); setData(d); }
    catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.gregorianDate || !form.hijriDate) { toast.error('التاريخ مطلوب'); return; }
    const cph = parseInt(form.cardsPerHour) || 0;
    if (cph > 4000) { toast.error('لا يمكن أن يتجاوز عدد بطاقات التوزيع في الساعة 4000'); return; }
    setSubmitting(true);
    try {
      await distributionApi.create({
        gregorianDate: form.gregorianDate, hijriDate: form.hijriDate,
        companies: parseInt(form.companies) || 0, batches: parseInt(form.batches) || 0,
        cardsPerHour: cph, platformActual: parseInt(form.platformActual) || 0,
        factoryActual: parseInt(form.factoryActual) || 0, distributionActual: parseInt(form.distributionActual) || 0,
      });
      toast.success('تم حفظ البيانات');
      setShowForm(false);
      setForm({ gregorianDate: '', hijriDate: '', companies: '', batches: '', cardsPerHour: '', platformActual: '', factoryActual: '', distributionActual: '' });
      load();
    } catch { toast.error('فشل حفظ البيانات'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { await distributionApi.delete(id); toast.success('تم حذف السجل'); load(); }
    catch { toast.error('فشل الحذف'); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const entries = data?.entries || [];
  const ach = data?.achievement;
  const dev = data?.deviation;

  // Chart data
  const barData = entries.slice(0, 12).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '', 'المتوقع': e.expectedCapacity, 'الفعلي': e.distributionActual,
  }));
  const lineData = entries.slice(0, 15).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '', 'نسبة الإنجاز': e.achievement,
  }));
  const devBarData = entries.slice(0, 10).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '', 'منصة↔مصنع': Math.abs(e.platVsFact), 'منصة↔توزيع': Math.abs(e.platVsDist), 'مصنع↔توزيع': Math.abs(e.factVsDist),
  }));

  return (
    <div className="space-y-8">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/20"><Activity className="w-5 h-5 text-violet-400" /></div>
          <div>
            <h2 className="text-lg font-bold text-white">الأداء التشغيلي لمسار التوزيع</h2>
            <p className="text-xs text-gray-400">المدة: {DURATION} ساعات | الأخصائيون: {SPECIALISTS}</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> إضافة بيانات
        </button>
      </div>

      {/* ═══ FORM ═══ */}
      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">إدخال بيانات تشغيلية</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'gregorianDate', label: 'التاريخ الميلادي', type: 'date' },
              { key: 'hijriDate', label: 'التاريخ الهجري', type: 'text', ph: '1447/09/28' },
              { key: 'companies', label: 'عدد الشركات', type: 'number' },
              { key: 'batches', label: 'عدد الدُفعات', type: 'number' },
              { key: 'cardsPerHour', label: 'البطاقات/ساعة', type: 'number' },
              { key: 'platformActual', label: 'إنجاز المنصة', type: 'number' },
              { key: 'factoryActual', label: 'إنجاز المصنع', type: 'number' },
              { key: 'distributionActual', label: 'إنجاز التوزيع', type: 'number' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                <input type={f.type} placeholder={f.ph || ''} value={(form as any)[f.key]}
                  className={cn('input-field text-sm', f.key === 'cardsPerHour' && parseInt(form.cardsPerHour) > 4000 && 'border-red-500 ring-1 ring-red-500/30')}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                {f.key === 'cardsPerHour' && parseInt(form.cardsPerHour) > 4000 && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> الحد الأقصى 4000</p>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 text-xs text-gray-500">المدة: {DURATION} | الأخصائيون: {SPECIALISTS} (ثابت)</div>
            <button onClick={handleSubmit} disabled={submitting} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center">
          <BarChart3 className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">لا توجد بيانات تشغيلية بعد</p>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════ */}
          {/*  SECTION 1 — ACHIEVEMENT ENGINE (نسبة الإنجاز)         */}
          {/* ════════════════════════════════════════════════════════ */}
          {ach && (
            <Section title="أداء الإنجاز لمسار التوزيع" icon={TrendingUp} color="#34D399">
              {/* Executive Summary */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-emerald-500">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/15 shrink-0"><Shield className="w-5 h-5 text-emerald-400" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-300 mb-1">ملخص الإنجاز</h3>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {ach.avgAchievement >= 100
                        ? `حقق مسار التوزيع أداءً يفوق الطاقة المتوقعة بنسبة ${ach.avgAchievement}%، مما يعكس كفاءة تشغيلية عالية.`
                        : ach.avgAchievement >= 85
                        ? `يعمل مسار التوزيع بنسبة ${ach.avgAchievement}% من الطاقة المتوقعة — أداء جيد مع مجال للتحسين.`
                        : `يعمل مسار التوزيع بنسبة ${ach.avgAchievement}% من الطاقة المتوقعة — يحتاج مراجعة تشغيلية عاجلة.`}
                      {ach.overLimitCount > 0 ? ` تم تسجيل ${ach.overLimitCount} تجاوز للحد الأعلى.` : ' لم يتم رصد أي تجاوز.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="الطاقة المتوقعة" value={formatNumber(ach.totalExpected)} icon={Target} color="#8B5CF6" bg="bg-violet-500/20" />
                <Kpi label="الإنجاز الفعلي" value={formatNumber(ach.totalDistribution)} icon={CheckCircle} color="#34D399" bg="bg-emerald-500/20" />
                <Kpi label="نسبة الإنجاز" value={`${ach.avgAchievement}%`} icon={TrendingUp} color="#38BDF8" bg="bg-sky-500/20" />
                <Kpi label="الحالة التشغيلية" value={ACH_STATUS[ach.overallStatus]?.label || '—'} icon={Activity}
                  color={ach.overallStatus === 'excellent' ? '#34D399' : ach.overallStatus === 'critical' ? '#F87171' : '#FBBF24'}
                  bg={ACH_STATUS[ach.overallStatus]?.bg || 'bg-gray-500/20'} />
              </div>

              {/* Gauge + Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center justify-center">
                  <Ring value={ach.avgAchievement} size={120} />
                  <p className="text-sm font-semibold text-white mt-3">نسبة الإنجاز العام</p>
                  <p className="text-[10px] text-gray-500">{formatNumber(ach.totalDistribution)} من {formatNumber(ach.totalExpected)}</p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <h4 className="text-sm font-semibold text-white mb-3">المتوقع مقابل الفعلي</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                      <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                      <YAxis tick={axisTickStyle} stroke={axisStroke} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                      <Legend wrapperStyle={legendStyle} />
                      <Bar dataKey="المتوقع" fill="#8B5CF6" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="الفعلي" fill="#34D399" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <h4 className="text-sm font-semibold text-white mb-3">اتجاه نسبة الإنجاز</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={lineData}>
                      <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                      <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                      <YAxis tick={axisTickStyle} stroke={axisStroke} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                      <Line type="monotone" dataKey="نسبة الإنجاز" stroke="#34D399" strokeWidth={2.5}
                        dot={{ r: 3, fill: '#34D399', strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#34D399', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Section>
          )}

          {/* ════════════════════════════════════════════════════════ */}
          {/*  SECTION 2 — DEVIATION ENGINE (نسبة الانحراف)           */}
          {/* ════════════════════════════════════════════════════════ */}
          {dev && (
            <Section title="تحليل الانحراف لمسار التوزيع" icon={ArrowLeftRight} color="#F87171">
              {/* Critical Alert */}
              {dev.hasCriticalDeviation && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-300">تم رصد انحراف مرتفع بين الجهات التشغيلية — يحتاج مراجعة فورية</p>
                </div>
              )}

              {/* Executive Summary */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-red-400">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-red-500/15 shrink-0"><Shield className="w-5 h-5 text-red-400" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-red-300 mb-1">ملخص الانحراف</h3>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      أعلى نسبة انحراف ظهرت بين {dev.highestDeviation.pair} بنسبة {Math.round(Math.abs(dev.highestDeviation.avg) * 10) / 10}%
                      {dev.hasCriticalDeviation ? '، مما يدل على عدم توافق تشغيلي يستدعي تدخل عاجل.' : '، وهي ضمن المستوى المقبول.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deviation KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {dev.deviations.map((d: any, i: number) => {
                  const sev = DEV_SEVERITY[d.severity] || DEV_SEVERITY.low;
                  return (
                    <div key={i} className="analytics-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">{d.pair}</span>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full', sev.bg, sev.color)}>{sev.label}</span>
                      </div>
                      <p className={cn('text-2xl font-bold tabular-nums', Math.abs(d.avg) > 25 ? 'text-red-400' : Math.abs(d.avg) > 10 ? 'text-amber-400' : 'text-emerald-400')}>
                        {d.avg > 0 ? '+' : ''}{d.avg}%
                      </p>
                      {/* Heatmap bar */}
                      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{
                          width: `${Math.min(100, Math.abs(d.avg) * 2)}%`,
                          background: d.severity === 'high' ? '#F87171' : d.severity === 'medium' ? '#FBBF24' : '#34D399',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Deviation Chart */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <h4 className="text-sm font-semibold text-white mb-3">مقارنة الانحرافات عبر الوقت</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={devBarData}>
                    <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                    <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                    <YAxis tick={axisTickStyle} stroke={axisStroke} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                    <Legend wrapperStyle={legendStyle} />
                    <Bar dataKey="منصة↔مصنع" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="منصة↔توزيع" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="مصنع↔توزيع" fill="#F87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {/* ═══ UNIFIED TABLE ═══ */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">البيانات التشغيلية الكاملة</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['التاريخ', 'الهجري', 'شركات', 'دفعات', 'بطاقات/س', 'المتوقع', 'المنصة', 'المصنع', 'التوزيع', 'الإنجاز', 'م↔ص', 'م↔ت', 'ص↔ت', 'الحالة', ''].map((h, i) => (
                    <th key={i} className="py-2 px-2 text-[10px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => {
                  const st = ACH_STATUS[e.achievementStatus] || ACH_STATUS.warning;
                  return (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 px-2 text-xs text-gray-300 tabular-nums">{new Date(e.gregorianDate).toLocaleDateString('ar-SA')}</td>
                      <td className="py-2 px-2 text-xs text-gray-300">{e.hijriDate}</td>
                      <td className="py-2 px-2 text-xs text-white tabular-nums">{e.companies}</td>
                      <td className="py-2 px-2 text-xs text-white tabular-nums">{e.batches}</td>
                      <td className={cn('py-2 px-2 text-xs tabular-nums font-medium', e.overLimit ? 'text-red-400' : 'text-white')}>{formatNumber(e.cardsPerHour)}</td>
                      <td className="py-2 px-2 text-xs text-gray-300 tabular-nums">{formatNumber(e.expectedCapacity)}</td>
                      <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.platformActual)}</td>
                      <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.factoryActual)}</td>
                      <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.distributionActual)}</td>
                      <td className="py-2 px-2 text-xs font-bold tabular-nums text-white">{e.achievement}%</td>
                      <td className={cn('py-2 px-2 text-xs tabular-nums', Math.abs(e.platVsFact) > 25 ? 'text-red-400' : 'text-gray-300')}>{e.platVsFact}%</td>
                      <td className={cn('py-2 px-2 text-xs tabular-nums', Math.abs(e.platVsDist) > 25 ? 'text-red-400' : 'text-gray-300')}>{e.platVsDist}%</td>
                      <td className={cn('py-2 px-2 text-xs tabular-nums', Math.abs(e.factVsDist) > 25 ? 'text-red-400' : 'text-gray-300')}>{e.factVsDist}%</td>
                      <td className="py-2 px-2"><span className={cn('text-[10px] px-2 py-0.5 rounded-full', st.bg, st.color)}>{st.label}</span></td>
                      <td className="py-2 px-2">
                        <button onClick={() => handleDelete(e.id)} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
