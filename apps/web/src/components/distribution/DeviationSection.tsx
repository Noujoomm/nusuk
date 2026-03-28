'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Plus, Trash2, Loader2, AlertCircle, ArrowLeftRight, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { distDeviationApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const DEV_SEV = (v: number) => {
  const a = Math.abs(v);
  if (a <= 10) return { label: 'منخفض', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
  if (a <= 25) return { label: 'متوسط', color: 'text-amber-400', bg: 'bg-amber-500/20' };
  return { label: 'مرتفع', color: 'text-red-400', bg: 'bg-red-500/20' };
};

export default function DeviationSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    gregorianDate: '', hijriDate: '', companies: '',
    platformValue: '', factoryValue: '', distributionValue: '', inValue: '', outValue: '',
    platformDevPct: '', fullReceiptDevPct: '', completionCertDevPct: '', booking3HourDevPct: '',
  });

  const load = useCallback(async () => {
    try { const { data: d } = await distDeviationApi.dashboard(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.gregorianDate || !form.hijriDate) { toast.error('التاريخ مطلوب'); return; }
    setSubmitting(true);
    try {
      await distDeviationApi.create({
        gregorianDate: form.gregorianDate, hijriDate: form.hijriDate,
        companies: parseInt(form.companies) || 0,
        platformValue: parseInt(form.platformValue) || 0,
        factoryValue: parseInt(form.factoryValue) || 0,
        distributionValue: parseInt(form.distributionValue) || 0,
        inValue: parseInt(form.inValue) || 0,
        outValue: parseInt(form.outValue) || 0,
        platformDevPct: parseFloat(form.platformDevPct) || 0,
        fullReceiptDevPct: parseFloat(form.fullReceiptDevPct) || 0,
        completionCertDevPct: parseFloat(form.completionCertDevPct) || 0,
        booking3HourDevPct: parseFloat(form.booking3HourDevPct) || 0,
      });
      toast.success('تم حفظ بيانات الانحراف');
      setShowForm(false);
      setForm({ gregorianDate: '', hijriDate: '', companies: '', platformValue: '', factoryValue: '', distributionValue: '', inValue: '', outValue: '', platformDevPct: '', fullReceiptDevPct: '', completionCertDevPct: '', booking3HourDevPct: '' });
      load();
    } catch { toast.error('فشل الحفظ'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const entries = data?.entries || [];
  const s = data?.summary;

  const trendData = entries.slice(0, 15).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '',
    'المنصة': Math.abs(e.platformDevPct),
    'الاستلام': Math.abs(e.fullReceiptDevPct),
    'الإتمام': Math.abs(e.completionCertDevPct),
    '3 ساعات': Math.abs(e.booking3HourDevPct),
  }));

  const compData = entries.slice(0, 10).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '',
    'المنصة': e.platformValue, 'المصنع': e.factoryValue, 'التوزيع': e.distributionValue,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/20"><ArrowLeftRight className="w-5 h-5 text-red-400" /></div>
          <h2 className="text-base font-bold text-white">نسبة الانحراف — Deviation Percentage</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> إضافة بيانات الانحراف
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">إدخال بيانات الانحراف</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'gregorianDate', l: 'التاريخ الميلادي', t: 'date' },
              { k: 'hijriDate', l: 'التاريخ الهجري', t: 'text', ph: '1447/09/28' },
              { k: 'companies', l: 'عدد الشركات', t: 'number' },
              { k: 'platformValue', l: 'قيمة المنصة', t: 'number' },
              { k: 'factoryValue', l: 'قيمة المصنع', t: 'number' },
              { k: 'distributionValue', l: 'قيمة التوزيع', t: 'number' },
              { k: 'inValue', l: 'الوارد IN', t: 'number' },
              { k: 'outValue', l: 'الصادر OUT', t: 'number' },
              { k: 'platformDevPct', l: 'انحراف المنصة %', t: 'number' },
              { k: 'fullReceiptDevPct', l: 'انحراف الاستلام الكامل %', t: 'number' },
              { k: 'completionCertDevPct', l: 'انحراف شهادة الإتمام %', t: 'number' },
              { k: 'booking3HourDevPct', l: 'انحراف حجز 3 ساعات %', t: 'number' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                <input type={f.t} placeholder={f.ph || ''} value={(form as any)[f.k]} className="input-field text-sm"
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <button onClick={submit} disabled={submitting} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center">
          <ArrowLeftRight className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">لا توجد بيانات انحراف بعد</p>
        </div>
      ) : (
        <>
          {/* Critical alert */}
          {s?.hasCritical && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">تم رصد انحراف مرتفع (أكثر من 25%) — يحتاج مراجعة فورية</p>
            </div>
          )}

          {/* Summary */}
          {s && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-red-400">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-500/15 shrink-0"><Shield className="w-5 h-5 text-red-400" /></div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  متوسط انحراف المنصة {s.avgPlatform}% | الاستلام {s.avgReceipt}% | الإتمام {s.avgCert}% | حجز 3 ساعات {s.avg3Hour}%.
                </p>
              </div>
            </div>
          )}

          {/* Deviation KPI Cards */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'انحراف المنصة', v: s.latestPlatform },
                { l: 'انحراف الاستلام', v: s.latestReceipt },
                { l: 'انحراف الإتمام', v: s.latestCert },
                { l: 'انحراف 3 ساعات', v: s.latest3Hour },
              ].map((k, i) => {
                const sev = DEV_SEV(k.v);
                return (
                  <div key={i} className="analytics-card">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">{k.l}</span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full', sev.bg, sev.color)}>{sev.label}</span>
                    </div>
                    <p className={cn('text-2xl font-bold tabular-nums', Math.abs(k.v) > 25 ? 'text-red-400' : Math.abs(k.v) > 10 ? 'text-amber-400' : 'text-emerald-400')}>
                      {k.v > 0 ? '+' : ''}{k.v}%
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, Math.abs(k.v) * 2)}%`,
                        background: Math.abs(k.v) > 25 ? '#F87171' : Math.abs(k.v) > 10 ? '#FBBF24' : '#34D399',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">اتجاه الانحرافات</h4>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Line type="monotone" dataKey="المنصة" stroke="#38BDF8" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="الاستلام" stroke="#FBBF24" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="الإتمام" stroke="#A78BFA" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="3 ساعات" stroke="#F87171" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">المنصة vs المصنع vs التوزيع</h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={compData}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar dataKey="المنصة" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="المصنع" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="التوزيع" fill="#F87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">سجل بيانات الانحراف</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10">
                {['التاريخ', 'الهجري', 'شركات', 'المنصة', 'المصنع', 'التوزيع', 'IN', 'OUT', 'انحراف المنصة', 'الاستلام', 'الإتمام', '3 ساعات', ''].map((h, i) => (
                  <th key={i} className="py-2 px-2 text-[10px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-2 text-xs text-gray-300 tabular-nums">{new Date(e.gregorianDate).toLocaleDateString('ar-SA')}</td>
                    <td className="py-2 px-2 text-xs text-gray-300">{e.hijriDate}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{e.companies}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.platformValue)}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.factoryValue)}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.distributionValue)}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.inValue)}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.outValue)}</td>
                    {[e.platformDevPct, e.fullReceiptDevPct, e.completionCertDevPct, e.booking3HourDevPct].map((v: number, j: number) => (
                      <td key={j} className={cn('py-2 px-2 text-xs font-medium tabular-nums', Math.abs(v) > 25 ? 'text-red-400' : Math.abs(v) > 10 ? 'text-amber-400' : 'text-emerald-400')}>
                        {v > 0 ? '+' : ''}{v}%
                      </td>
                    ))}
                    <td className="py-2 px-2"><button onClick={() => handleDel(e.id)} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  function handleDel(id: string) {
    distDeviationApi.delete(id).then(() => { toast.success('تم الحذف'); load(); }).catch(() => toast.error('فشل الحذف'));
  }
}
