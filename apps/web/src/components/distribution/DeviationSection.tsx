'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Plus, Trash2, Loader2, AlertCircle, ArrowLeftRight, X, Shield, Clock, FileCheck, Package, Bug } from 'lucide-react';
import DatePairInput from '@/components/ui/date-pair-input';
import toast from 'react-hot-toast';
import { distDeviationApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const sevColor = (v: number) => v <= 5 ? 'text-emerald-400' : v <= 15 ? 'text-amber-400' : v < 30 ? 'text-orange-400' : 'text-red-400';
const sevBg = (v: number) => v <= 5 ? 'bg-emerald-500/20' : v <= 15 ? 'bg-amber-500/20' : v < 30 ? 'bg-orange-500/20' : 'bg-red-500/20';
const sevLabel = (v: number) => v === 0 ? 'مثالي' : v <= 5 ? 'ممتاز' : v <= 15 ? 'مقبول' : v < 30 ? 'تحذير' : 'حرج';
const sevBar = (v: number) => v <= 5 ? '#34D399' : v <= 15 ? '#FBBF24' : v < 30 ? '#FB923C' : '#F87171';
const PIE_COLORS = ['#38BDF8', '#FBBF24', '#A78BFA'];

function DevCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="analytics-card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-gray-400" /><span className="text-[10px] text-gray-400">{label}</span></div>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', sevBg(value), sevColor(value))}>{sevLabel(value)}</span>
      </div>
      <p className={cn('text-xl font-bold tabular-nums', sevColor(value))}>{value}%</p>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value * 2)}%`, background: sevBar(value) }} />
      </div>
    </div>
  );
}

function SubSection({ title, icon: Icon, color, children }: { title: string; icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><div className="p-1.5 rounded-lg" style={{ background: `${color}20` }}><Icon className="w-4 h-4" style={{ color }} /></div><h3 className="text-sm font-semibold text-white">{title}</h3></div>
      {children}
    </div>
  );
}

const EMPTY = { gregorianDate: '', hijriDate: '', platformValue: '', factoryValue: '', distributionValue: '', totalCompanies3h: '', attendedCompanies3h: '', completionPct: '100', totalReceiving: '', completedReceiving: '', reportsPlatform: '0', reportsApple: '0', reportsAndroid: '0', notes: '' };

export default function DeviationSection() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'track_lead';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try { const { data: d } = await distDeviationApi.dashboard(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.gregorianDate || !form.hijriDate) { toast.error('التاريخ مطلوب'); return; }
    const recv = parseInt(form.totalReceiving) || 0;
    const booked = parseInt(form.attendedCompanies3h) || 0;
    if (recv > booked && booked > 0) { toast.error('الاستلام الكامل للحبال لا يمكن أن يتجاوز عدد الشركات التي حجزت موعد'); return; }
    setSubmitting(true);
    try {
      await distDeviationApi.create({
        gregorianDate: form.gregorianDate, hijriDate: form.hijriDate,
        companies: parseInt(form.totalCompanies3h) || 0,
        platformValue: parseInt(form.platformValue) || 0,
        factoryValue: parseInt(form.factoryValue) || 0,
        distributionValue: parseInt(form.distributionValue) || 0,
        totalCompanies3h: parseInt(form.totalCompanies3h) || 0,
        attendedCompanies3h: parseInt(form.attendedCompanies3h) || 0,
        completionPct: parseInt(form.completionPct) ?? 100,
        totalReceiving: parseInt(form.totalReceiving) || 0,
        completedReceiving: parseInt(form.completedReceiving) || 0,
        reportsPlatform: parseInt(form.reportsPlatform) || 0,
        reportsApple: parseInt(form.reportsApple) || 0,
        reportsAndroid: parseInt(form.reportsAndroid) || 0,
        ...(form.notes ? { notes: form.notes } : {}),
      });
      toast.success('تم الحفظ — الانحرافات محسوبة تلقائياً');
      setShowForm(false); setForm(EMPTY); load();
    } catch { toast.error('فشل الحفظ'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  const entries = data?.entries || [];
  const s = data?.summary;
  const latest = entries[0];

  const pieData = latest && latest.totalReports > 0 ? [
    { name: 'المنصة', value: latest.reportsPlatformPct },
    { name: 'Apple', value: latest.reportsApplePct },
    { name: 'Android', value: latest.reportsAndroidPct },
  ].filter((d: any) => d.value > 0) : [];

  const barData = latest ? [
    { name: 'منصة↔مصنع', value: latest.platVsFact },
    { name: 'مصنع↔توزيع', value: latest.factVsDist },
    { name: 'منصة↔توزيع', value: latest.platVsDist },
    { name: 'حجز موعد', value: latest.appointmentDev },
    { name: 'شهادة إنجاز', value: latest.completionDev },
    { name: 'استلام الحبال', value: latest.receivingDev },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/20"><ArrowLeftRight className="w-5 h-5 text-red-400" /></div>
          <div><h2 className="text-base font-bold text-white">نسبة الانحراف</h2><p className="text-[10px] text-gray-500">كل فئة تُحسب بمعادلة مستقلة — لا يتم دمج الانحرافات</p></div>
        </div>
        {canEdit && <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إدخال بيانات</button>}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">إدخال البيانات الخام</h3><button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button></div>

          {/* Section 1 inputs */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">القسم ١: المدخلات الأساسية</p>
            <DatePairInput
              gregorianDate={form.gregorianDate} hijriDate={form.hijriDate}
              onGregorianChange={(v) => setForm({ ...form, gregorianDate: v })}
              onHijriChange={(v) => setForm({ ...form, hijriDate: v })}
              gregorianLabel="التاريخ" hijriLabel="الموافق"
              className="mb-3"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { k: 'platformValue', l: 'المنصة', t: 'number' },
                { k: 'factoryValue', l: 'المصنع', t: 'number' },
                { k: 'distributionValue', l: 'التوزيع', t: 'number' },
              ].map((f) => (
                <div key={f.k}><label className="block text-xs text-gray-400 mb-1">{f.l}</label><input type={f.t} value={(form as any)[f.k]} className="input-field text-sm" onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} /></div>
              ))}
            </div>
          </div>

          {/* Section 2 inputs */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">القسم ٢: المخرجات</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { k: 'totalCompanies3h', l: 'إجمالي الشركات', t: 'number' },
                { k: 'attendedCompanies3h', l: 'شركات حجزت موعد', t: 'number' },
                { k: 'completionPct', l: 'نسبة شهادة الإنجاز %', t: 'number' },
                { k: 'totalReceiving', l: 'الاستلام الكامل للحبال', t: 'number', hint: 'من أصل الشركات التي حجزت موعد' },
                { k: 'completedReceiving', l: 'استلام مكتمل', t: 'number' },
              ].map((f: any) => (
                <div key={f.k}>
                  <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                  <input type={f.t} value={(form as any)[f.k]} className={cn('input-field text-sm',
                    f.k === 'totalReceiving' && parseInt(form.totalReceiving) > parseInt(form.attendedCompanies3h) && parseInt(form.attendedCompanies3h) > 0 && 'border-red-500 ring-1 ring-red-500/30')}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                  {f.hint && <p className="text-[9px] text-gray-500 mt-0.5">{f.hint}</p>}
                  {f.k === 'totalReceiving' && parseInt(form.totalReceiving) > parseInt(form.attendedCompanies3h) && parseInt(form.attendedCompanies3h) > 0 && (
                    <p className="text-[9px] text-red-400 mt-0.5">لا يمكن أن يتجاوز عدد الشركات التي حجزت موعد ({form.attendedCompanies3h})</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 3 inputs */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">القسم ٣: بلاغات النظام</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: 'reportsPlatform', l: 'بلاغات المنصة' },
                { k: 'reportsApple', l: 'بلاغات Apple' },
                { k: 'reportsAndroid', l: 'بلاغات Android' },
              ].map((f) => (
                <div key={f.k}><label className="block text-xs text-gray-400 mb-1">{f.l}</label><input type="number" value={(form as any)[f.k]} className="input-field text-sm" onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} /></div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">ملاحظات (اختياري)</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000}
              rows={2} className="input-field text-sm w-full resize-none" placeholder="أضف ملاحظات..." />
          </div>
          <div className="flex justify-end"><button onClick={submit} disabled={submitting} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</button></div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center"><ArrowLeftRight className="w-10 h-10 text-gray-500 mx-auto mb-3" /><p className="text-sm text-gray-400">لا توجد بيانات انحراف</p></div>
      ) : (<>
        {s?.hasCritical && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">تم رصد انحراف حرج (≥30%) — يحتاج تدخل فوري</p></div>
        )}

        {/* ── SECTION 1: Input Deviations ── */}
        <SubSection title="انحراف المدخلات (المنصة / المصنع / التوزيع)" icon={ArrowLeftRight} color="#F87171">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DevCard label="المنصة ↔ المصنع" value={latest?.platVsFact ?? 0} icon={ArrowLeftRight} />
            <DevCard label="المصنع ↔ التوزيع" value={latest?.factVsDist ?? 0} icon={ArrowLeftRight} />
            <DevCard label="المنصة ↔ التوزيع" value={latest?.platVsDist ?? 0} icon={ArrowLeftRight} />
          </div>
        </SubSection>

        {/* ── SECTION 2: Output Deviations ── */}
        <SubSection title="انحراف المخرجات" icon={FileCheck} color="#FBBF24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DevCard label="شركات حجزت موعد" value={latest?.appointmentDev ?? 0} icon={Clock} />
            <DevCard label="شهادة الإنجاز" value={latest?.completionDev ?? 0} icon={FileCheck} />
            <DevCard label="الاستلام الكامل للحبال" value={latest?.receivingDev ?? 0} icon={Package} />
          </div>
        </SubSection>

        {/* ── SECTION 3: System Reports ── */}
        <SubSection title="بلاغات النظام" icon={Bug} color="#A78BFA">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: 'المنصة', v: latest?.reportsPlatformPct ?? 0, raw: latest?.reportsPlatform ?? 0 },
                { l: 'Apple', v: latest?.reportsApplePct ?? 0, raw: latest?.reportsApple ?? 0 },
                { l: 'Android', v: latest?.reportsAndroidPct ?? 0, raw: latest?.reportsAndroid ?? 0 },
              ].map((r, i) => (
                <div key={i} className="analytics-card text-center">
                  <p className="text-[10px] text-gray-400">{r.l}</p>
                  <p className="text-lg font-bold text-white tabular-nums mt-1">{r.v}%</p>
                  <p className="text-[9px] text-gray-500">{r.raw} بلاغ</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" nameKey="name" stroke="rgba(15,23,42,0.7)" strokeWidth={2}>
                      {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                    <Legend wrapperStyle={legendStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-500 text-center py-12">لا توجد بلاغات</p>}
            </div>
          </div>
        </SubSection>

        {/* ── ALL DEVIATIONS BAR CHART ── */}
        {barData.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-white mb-3">مقارنة جميع الانحرافات</h4>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                <YAxis tick={axisTickStyle} stroke={axisStroke} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {barData.map((d, i) => <Cell key={i} fill={sevBar(d.value)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── TABLE ── */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b border-white/10">
            {['التاريخ', 'المنصة', 'المصنع', 'التوزيع', 'م↔ص', 'ص↔ت', 'م↔ت', 'حجز موعد', 'شهادة', 'الحبال', 'بلاغات', ''].map((h, i) => (
              <th key={i} className="py-2 px-1.5 text-[9px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>
            {entries.map((e: any) => (
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 px-1.5 text-[10px] text-gray-300">{e.hijriDate}</td>
                <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.platformValue)}</td>
                <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.factoryValue)}</td>
                <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.distributionValue)}</td>
                {[e.platVsFact, e.factVsDist, e.platVsDist, e.appointmentDev, e.completionDev, e.receivingDev].map((v: number, j: number) => (
                  <td key={j} className={cn('py-2 px-1.5 text-[10px] font-medium tabular-nums', sevColor(v))}>{v}%</td>
                ))}
                <td className="py-2 px-1.5 text-[10px] text-gray-300 tabular-nums">{e.totalReports}</td>
                {canEdit && <td className="py-2 px-1.5"><button onClick={() => { distDeviationApi.delete(e.id).then(() => { toast.success('تم'); load(); }).catch(() => toast.error('فشل')); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3 h-3" /></button></td>}
              </tr>
            ))}
          </tbody></table>
        </div>
      </>)}
    </div>
  );
}
