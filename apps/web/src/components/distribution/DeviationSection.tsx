'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Plus, Trash2, Loader2, AlertCircle, ArrowLeftRight, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { distDeviationApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const sevColor = (v: number) => Math.abs(v) <= 5 ? 'text-emerald-400' : Math.abs(v) <= 15 ? 'text-amber-400' : 'text-red-400';
const sevBg = (v: number) => Math.abs(v) <= 5 ? 'bg-emerald-500/20' : Math.abs(v) <= 15 ? 'bg-amber-500/20' : 'bg-red-500/20';
const sevLabel = (v: number) => Math.abs(v) <= 5 ? 'منخفض' : Math.abs(v) <= 15 ? 'متوسط' : 'مرتفع';
const sevBar = (v: number) => Math.abs(v) <= 5 ? '#34D399' : Math.abs(v) <= 15 ? '#FBBF24' : '#F87171';

export default function DeviationSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    gregorianDate: '', hijriDate: '', companies: '',
    platformValue: '', factoryValue: '', distributionValue: '',
    fullDeliveryCount: '', scheduledAppointments: '', actualAppointments: '',
    sortingTime: '',
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
        fullDeliveryCount: parseInt(form.fullDeliveryCount) || 0,
        scheduledAppointments: parseInt(form.scheduledAppointments) || 0,
        actualAppointments: parseInt(form.actualAppointments) || 0,
        sortingTime: parseInt(form.sortingTime) || 0,
      });
      toast.success('تم حفظ البيانات — الانحرافات محسوبة تلقائياً');
      setShowForm(false);
      setForm({ gregorianDate: '', hijriDate: '', companies: '', platformValue: '', factoryValue: '', distributionValue: '', fullDeliveryCount: '', scheduledAppointments: '', actualAppointments: '', sortingTime: '' });
      load();
    } catch { toast.error('فشل الحفظ'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const entries = data?.entries || [];
  const s = data?.summary;

  const trendData = entries.slice(0, 15).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '',
    'المنصة': e.platformDev, 'المصنع': e.factoryDev, 'التوزيع': e.distributionDev,
    'التسليم': e.deliveryDev, 'المواعيد': e.appointmentDev, 'الفرز': e.sortingDev,
  }));

  const devFields = [
    { key: 'platformDev', label: 'انحراف المنصة', latest: s?.latestPlatform, avg: s?.avgPlatform },
    { key: 'factoryDev', label: 'انحراف المصنع', latest: s?.latestFactory, avg: s?.avgFactory },
    { key: 'distributionDev', label: 'انحراف التوزيع', latest: s?.latestDistribution, avg: s?.avgDistribution },
    { key: 'deliveryDev', label: 'انحراف التسليم', latest: s?.latestDelivery, avg: s?.avgDelivery },
    { key: 'appointmentDev', label: 'انحراف المواعيد', latest: s?.latestAppointment, avg: s?.avgAppointment },
    { key: 'sortingDev', label: 'انحراف الفرز', latest: s?.latestSorting, avg: s?.avgSorting },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/20"><ArrowLeftRight className="w-5 h-5 text-red-400" /></div>
          <div>
            <h2 className="text-base font-bold text-white">نسبة الانحراف</h2>
            <p className="text-[10px] text-gray-500">الانحرافات تُحسب تلقائياً من البيانات الخام</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إدخال بيانات خام</button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">إدخال البيانات الخام فقط</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'gregorianDate', l: 'التاريخ الميلادي', t: 'date' },
              { k: 'hijriDate', l: 'التاريخ الهجري', t: 'text', ph: '1447/09/28' },
              { k: 'companies', l: 'عدد الشركات', t: 'number' },
              { k: 'platformValue', l: 'عدد المنصة', t: 'number' },
              { k: 'factoryValue', l: 'عدد المصنع', t: 'number' },
              { k: 'distributionValue', l: 'عدد التوزيع', t: 'number' },
              { k: 'fullDeliveryCount', l: 'عدد التسليم الكامل', t: 'number' },
              { k: 'scheduledAppointments', l: 'المواعيد المجدولة', t: 'number' },
              { k: 'actualAppointments', l: 'المواعيد الفعلية', t: 'number' },
              { k: 'sortingTime', l: 'وقت الفرز (دقائق)', t: 'number' },
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
          {s?.hasCritical && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">تم رصد انحراف مرتفع (أكثر من 15%) — يحتاج مراجعة فورية</p>
            </div>
          )}

          {s && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-red-400">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-500/15 shrink-0"><Shield className="w-5 h-5 text-red-400" /></div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  جميع الانحرافات محسوبة تلقائياً. أعلى متوسط انحراف: {
                    devFields.sort((a, b) => Math.abs(b.avg ?? 0) - Math.abs(a.avg ?? 0))[0]?.label
                  } بنسبة {Math.max(...devFields.map(d => Math.abs(d.avg ?? 0)))}%.
                </p>
              </div>
            </div>
          )}

          {/* 6 Deviation Cards */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {devFields.map((d, i) => (
                <div key={i} className="analytics-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400 truncate">{d.label}</span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', sevBg(d.latest ?? 0), sevColor(d.latest ?? 0))}>{sevLabel(d.latest ?? 0)}</span>
                  </div>
                  <p className={cn('text-xl font-bold tabular-nums', sevColor(d.latest ?? 0))}>{d.latest ?? 0}%</p>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.abs(d.latest ?? 0) * 3)}%`, background: sevBar(d.latest ?? 0) }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">اتجاه الانحرافات</h4>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Line type="monotone" dataKey="المنصة" stroke="#38BDF8" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="المصنع" stroke="#FBBF24" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="التوزيع" stroke="#A78BFA" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="التسليم" stroke="#34D399" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="المواعيد" stroke="#F87171" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="الفرز" stroke="#FB923C" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">مقارنة الجهات التشغيلية</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={entries.slice(0, 8).reverse().map((e: any) => ({ name: e.hijriDate?.slice(-5) || '', 'المنصة': e.platformValue, 'المصنع': e.factoryValue, 'التوزيع': e.distributionValue }))}>
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
                {['التاريخ', 'شركات', 'المنصة', 'المصنع', 'التوزيع', 'التسليم', 'مواعيد', 'فعلي', 'فرز', 'انح.المنصة', 'انح.المصنع', 'انح.التوزيع', 'انح.التسليم', 'انح.المواعيد', 'انح.الفرز', ''].map((h, i) => (
                  <th key={i} className="py-2 px-1.5 text-[9px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-1.5 text-[10px] text-gray-300">{e.hijriDate}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{e.companies}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.platformValue)}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.factoryValue)}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.distributionValue)}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{formatNumber(e.fullDeliveryCount)}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{e.scheduledAppointments}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{e.actualAppointments}</td>
                    <td className="py-2 px-1.5 text-[10px] text-white tabular-nums">{e.sortingTime}</td>
                    {[e.platformDev, e.factoryDev, e.distributionDev, e.deliveryDev, e.appointmentDev, e.sortingDev].map((v: number, j: number) => (
                      <td key={j} className={cn('py-2 px-1.5 text-[10px] font-medium tabular-nums', sevColor(v))}>{v}%</td>
                    ))}
                    <td className="py-2 px-1.5"><button onClick={() => { distDeviationApi.delete(e.id).then(() => { toast.success('تم الحذف'); load(); }).catch(() => toast.error('فشل')); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
