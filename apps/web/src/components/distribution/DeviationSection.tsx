'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { Plus, Trash2, Loader2, AlertCircle, ArrowLeftRight, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { distDeviationApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const sevColor = (v: number) => v === 0 ? 'text-sky-400' : v <= 5 ? 'text-emerald-400' : v <= 15 ? 'text-amber-400' : v < 30 ? 'text-orange-400' : 'text-red-400';
const sevBg = (v: number) => v === 0 ? 'bg-sky-500/20' : v <= 5 ? 'bg-emerald-500/20' : v <= 15 ? 'bg-amber-500/20' : v < 30 ? 'bg-orange-500/20' : 'bg-red-500/20';
const sevLabel = (v: number) => v === 0 ? 'مثالي' : v <= 5 ? 'ممتاز' : v <= 15 ? 'مقبول' : v < 30 ? 'تحذير' : 'حرج';
const sevBar = (v: number) => v <= 5 ? '#34D399' : v <= 15 ? '#FBBF24' : v < 30 ? '#FB923C' : '#F87171';

const EMPTY = { gregorianDate: '', hijriDate: '', companies: '', parcels: '', platformValue: '', factoryValue: '', distributionValue: '', threeHourValue: '', reportsPlatform: '', reportsApple: '', reportsAndroid: '' };

const DEV_FIELDS = [
  { key: 'platformDev', label: 'المنصة' },
  { key: 'factoryDev', label: 'المصنع' },
  { key: 'distributionDev', label: 'التوزيع' },
  { key: 'threeHourDev', label: '3HOUR' },
  { key: 'reportsPlatformDev', label: 'بلاغات المنصة' },
  { key: 'reportsAppleDev', label: 'Apple' },
  { key: 'reportsAndroidDev', label: 'Android' },
];

export default function DeviationSection() {
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
    if (!(parseInt(form.parcels) > 0)) { toast.error('عدد الطرود مطلوب (لا يمكن أن يكون صفراً)'); return; }
    setSubmitting(true);
    try {
      await distDeviationApi.create({
        gregorianDate: form.gregorianDate, hijriDate: form.hijriDate,
        companies: parseInt(form.companies) || 0, parcels: parseInt(form.parcels) || 0,
        platformValue: parseInt(form.platformValue) || 0, factoryValue: parseInt(form.factoryValue) || 0,
        distributionValue: parseInt(form.distributionValue) || 0, threeHourValue: parseInt(form.threeHourValue) || 0,
        reportsPlatform: parseInt(form.reportsPlatform) || 0, reportsApple: parseInt(form.reportsApple) || 0,
        reportsAndroid: parseInt(form.reportsAndroid) || 0,
      });
      toast.success('تم الحفظ — الانحرافات محسوبة تلقائياً');
      setShowForm(false); setForm(EMPTY); load();
    } catch { toast.error('فشل الحفظ'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  const entries = data?.entries || [];
  const s = data?.summary;

  // Donut for latest entry deviation breakdown
  const latest = entries[0];
  const donutData = latest ? DEV_FIELDS.map((f) => ({ name: f.label, value: (latest as any)[f.key] ?? 0 })).filter((d) => d.value > 0) : [];
  const DONUT_COLORS = ['#38BDF8', '#FBBF24', '#A78BFA', '#F87171', '#34D399', '#FB923C', '#818CF8'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/20"><ArrowLeftRight className="w-5 h-5 text-red-400" /></div>
          <div><h2 className="text-base font-bold text-white">نسبة الانحراف</h2><p className="text-[10px] text-gray-500">المعادلة: (القيمة ÷ عدد الطرود) × 100 — تقريب لمنزلة واحدة</p></div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إدخال بيانات</button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">إدخال البيانات الخام</h3><button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'gregorianDate', l: 'التاريخ', t: 'date' },
              { k: 'hijriDate', l: 'الموافق', t: 'text', ph: '1447/09/28' },
              { k: 'companies', l: 'عدد الشركات', t: 'number' },
              { k: 'parcels', l: 'عدد الطرود (المقام)', t: 'number' },
              { k: 'platformValue', l: 'المنصة', t: 'number' },
              { k: 'factoryValue', l: 'المصنع', t: 'number' },
              { k: 'distributionValue', l: 'التوزيع', t: 'number' },
              { k: 'threeHourValue', l: '3HOUR', t: 'number' },
              { k: 'reportsPlatform', l: 'بلاغات النظام - المنصة', t: 'number' },
              { k: 'reportsApple', l: 'بلاغات النظام - Apple', t: 'number' },
              { k: 'reportsAndroid', l: 'بلاغات النظام - Android', t: 'number' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                <input type={f.t} placeholder={f.ph || ''} value={(form as any)[f.k]} className="input-field text-sm"
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex justify-end"><button onClick={submit} disabled={submitting} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</button></div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center"><ArrowLeftRight className="w-10 h-10 text-gray-500 mx-auto mb-3" /><p className="text-sm text-gray-400">لا توجد بيانات انحراف</p></div>
      ) : (<>
        {s?.hasCritical && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">انحراف حرج (≥30%) — يحتاج تدخل فوري</p>
          </div>
        )}

        {s && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-red-400">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-500/15 shrink-0"><Shield className="w-5 h-5 text-red-400" /></div>
              <p className="text-sm text-gray-300 leading-relaxed">
                أعلى مصدر انحراف: <span className="text-white font-medium">{s.highestSource?.name}</span> بنسبة <span className={sevColor(s.highestSource?.val ?? 0)}>{s.highestSource?.val ?? 0}%</span>.
                {' '}متوسط الانحراف الكلي: {s.avgTotal}%.
                {s.hasCritical && ' ⚠️ تم رصد انحراف حرج يتجاوز 30%.'}
              </p>
            </div>
          </div>
        )}

        {/* 7 Deviation Cards */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {DEV_FIELDS.map((f, i) => {
              const lv = latest ? (latest as any)[f.key] ?? 0 : 0;
              return (
                <div key={i} className="analytics-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400 truncate">{f.label}</span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', sevBg(lv), sevColor(lv))}>{sevLabel(lv)}</span>
                  </div>
                  <p className={cn('text-lg font-bold tabular-nums', sevColor(lv))}>{lv}%</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, lv * 2)}%`, background: sevBar(lv) }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-white mb-3">تفصيل الانحرافات</h4>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={entries.slice(0, 8).reverse().map((e: any) => ({
                name: e.hijriDate?.slice(-5) || '',
                ...Object.fromEntries(DEV_FIELDS.map((f) => [f.label, (e as any)[f.key] ?? 0])),
              }))}>
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} /><XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} /><YAxis tick={axisTickStyle} stroke={axisStroke} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} /><Legend wrapperStyle={legendStyle} />
                {DEV_FIELDS.map((f, i) => <Bar key={f.key} dataKey={f.label} fill={DONUT_COLORS[i]} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-white mb-3">توزيع الانحرافات (أحدث سجل)</h4>
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" stroke="rgba(15,23,42,0.7)" strokeWidth={2}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-500 text-center py-16">لا توجد انحرافات</p>}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b border-white/10">
            {['التاريخ', 'الموافق', 'شركات', 'طرود', 'المنصة', 'المصنع', 'التوزيع', '3HOUR', 'بلاغات المنصة', 'Apple', 'Android', ...DEV_FIELDS.map((f) => `${f.label} %`), 'الكلي %', ''].map((h, i) => (
              <th key={i} className="py-2 px-1 text-[9px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
            ))}
          </tr></thead><tbody>
            {entries.map((e: any) => (
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 px-1 text-[10px] text-gray-300 tabular-nums">{new Date(e.gregorianDate).toLocaleDateString('ar-SA')}</td>
                <td className="py-2 px-1 text-[10px] text-gray-300">{e.hijriDate}</td>
                <td className="py-2 px-1 text-[10px] text-white tabular-nums">{e.companies}</td>
                <td className="py-2 px-1 text-[10px] text-white tabular-nums">{formatNumber(e.parcels)}</td>
                {['platformValue', 'factoryValue', 'distributionValue', 'threeHourValue', 'reportsPlatform', 'reportsApple', 'reportsAndroid'].map((k) => (
                  <td key={k} className="py-2 px-1 text-[10px] text-white tabular-nums">{formatNumber((e as any)[k])}</td>
                ))}
                {DEV_FIELDS.map((f) => {
                  const v = (e as any)[f.key] ?? 0;
                  return <td key={f.key} className={cn('py-2 px-1 text-[10px] font-medium tabular-nums', sevColor(v))}>{v}%</td>;
                })}
                <td className={cn('py-2 px-1 text-[10px] font-bold tabular-nums', sevColor(e.totalDev))}>{e.totalDev}%</td>
                <td className="py-2 px-1"><button onClick={() => { distDeviationApi.delete(e.id).then(() => { toast.success('تم'); load(); }).catch(() => toast.error('فشل')); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3 h-3" /></button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </>)}
    </div>
  );
}
