'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  Plus, Trash2, Loader2, AlertTriangle, CheckCircle, TrendingUp,
  Target, Activity, BarChart3, Shield, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { distributionApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

const DURATION = 4;
const SPECIALISTS = 4;

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: 'ممتاز', color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
  on_track: { label: 'على المسار', color: 'text-sky-300', bg: 'bg-sky-500/20' },
  warning: { label: 'تحذير', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  critical: { label: 'حرج', color: 'text-red-300', bg: 'bg-red-500/20' },
};

function Ring({ value, color, size = 90 }: { value: number; color: string; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-white">{value}%</span>
      </div>
    </div>
  );
}

export default function DistributionDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    gregorianDate: '', hijriDate: '', companies: '', batches: '',
    cardsPerHour: '', platformActual: '', factoryActual: '', distributionActual: '',
  });

  const load = useCallback(async () => {
    try {
      const { data: d } = await distributionApi.dashboard();
      setData(d);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.gregorianDate || !form.hijriDate) { toast.error('التاريخ مطلوب'); return; }
    const cardsPerHour = parseInt(form.cardsPerHour) || 0;
    if (cardsPerHour > 4000) { toast.error('لا يمكن أن يتجاوز عدد بطاقات التوزيع في الساعة 4000'); return; }

    setSubmitting(true);
    try {
      await distributionApi.create({
        gregorianDate: form.gregorianDate,
        hijriDate: form.hijriDate,
        companies: parseInt(form.companies) || 0,
        batches: parseInt(form.batches) || 0,
        cardsPerHour,
        platformActual: parseInt(form.platformActual) || 0,
        factoryActual: parseInt(form.factoryActual) || 0,
        distributionActual: parseInt(form.distributionActual) || 0,
      });
      toast.success('تم حفظ البيانات');
      setShowForm(false);
      setForm({ gregorianDate: '', hijriDate: '', companies: '', batches: '', cardsPerHour: '', platformActual: '', factoryActual: '', distributionActual: '' });
      load();
    } catch { toast.error('فشل حفظ البيانات'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await distributionApi.delete(id);
      toast.success('تم حذف السجل');
      load();
    } catch { toast.error('فشل الحذف'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  const entries = data?.entries || [];
  const summary = data?.summary;

  // Chart data
  const barData = entries.slice(0, 10).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '',
    'الطاقة المتوقعة': e.expectedCapacity,
    'المنصة': e.platformActual,
    'المصنع': e.factoryActual,
    'التوزيع': e.distributionActual,
  }));

  const lineData = entries.slice(0, 15).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '',
    'نسبة الإنجاز': e.achievement,
    'الفعلي': e.distributionActual,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/20"><Activity className="w-5 h-5 text-violet-400" /></div>
          <div>
            <h2 className="text-lg font-bold text-white">الأداء التشغيلي لمسار التوزيع</h2>
            <p className="text-xs text-gray-400">المدة: {DURATION} ساعات | عدد الأخصائيين: {SPECIALISTS}</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> إضافة بيانات
        </button>
      </div>

      {/* Executive Summary */}
      {summary && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-violet-500">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-violet-500/15 shrink-0"><Shield className="w-5 h-5 text-violet-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-violet-300 mb-2">الملخص التنفيذي</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                يعمل مسار التوزيع بنسبة {summary.avgAchievement}% من الطاقة المتوقعة.
                {summary.maxDeviation && ` أعلى انحراف بين ${summary.maxDeviation.pair} بنسبة ${Math.round(summary.maxDeviation.value)}%.`}
                {summary.overLimitCount > 0
                  ? ` تم تسجيل ${summary.overLimitCount} تجاوز للحد الأعلى (4000 بطاقة/ساعة).`
                  : ' لم يتم تسجيل أي تجاوز للحد الأعلى.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Entry Form */}
      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">إدخال بيانات تشغيلية جديدة</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'gregorianDate', label: 'التاريخ الميلادي', type: 'date' },
              { key: 'hijriDate', label: 'التاريخ الهجري', type: 'text', placeholder: '1447/09/15' },
              { key: 'companies', label: 'عدد الشركات', type: 'number' },
              { key: 'batches', label: 'عدد الدُفعات', type: 'number' },
              { key: 'cardsPerHour', label: 'البطاقات/ساعة', type: 'number', max: 4000 },
              { key: 'platformActual', label: 'إنجاز المنصة', type: 'number' },
              { key: 'factoryActual', label: 'إنجاز المصنع', type: 'number' },
              { key: 'distributionActual', label: 'إنجاز التوزيع', type: 'number' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                <input type={f.type} placeholder={f.placeholder || ''} className={cn('input-field text-sm',
                  f.key === 'cardsPerHour' && parseInt((form as any)[f.key]) > 4000 && 'border-red-500 ring-1 ring-red-500/30')}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                {f.key === 'cardsPerHour' && parseInt(form.cardsPerHour) > 4000 && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> الحد الأقصى 4000
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <div className="flex-1 text-xs text-gray-500">المدة: {DURATION} ساعات | الأخصائيون: {SPECIALISTS} (ثابت)</div>
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
          <p className="text-xs text-gray-500 mt-1">أضف أول سجل باستخدام زر "إضافة بيانات"</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'الطاقة المتوقعة', value: formatNumber(summary.totalExpected), icon: Target, color: '#8B5CF6', bg: 'bg-violet-500/20' },
                { label: 'إنجاز التوزيع', value: formatNumber(summary.totalDistribution), icon: CheckCircle, color: '#34D399', bg: 'bg-emerald-500/20' },
                { label: 'نسبة الإنجاز', value: `${summary.avgAchievement}%`, icon: TrendingUp, color: '#38BDF8', bg: 'bg-sky-500/20' },
                { label: 'الحالة', value: STATUS_MAP[summary.overallStatus]?.label || '—', icon: Activity, color: summary.overallStatus === 'excellent' ? '#34D399' : summary.overallStatus === 'critical' ? '#F87171' : '#FBBF24', bg: STATUS_MAP[summary.overallStatus]?.bg || 'bg-gray-500/20' },
              ].map((k, i) => (
                <div key={i} className="analytics-card" style={{ borderBottom: `2px solid ${k.color}` }}>
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2.5 rounded-xl', k.bg)}><k.icon className="w-5 h-5" style={{ color: k.color }} /></div>
                    <div><p className="text-xl font-bold text-white tabular-nums">{k.value}</p><p className="text-[11px] text-gray-400">{k.label}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Achievement Gauge */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center">
                <Ring value={summary.avgAchievement} color={summary.avgAchievement >= 85 ? '#34D399' : summary.avgAchievement >= 70 ? '#FBBF24' : '#F87171'} size={100} />
                <p className="text-sm font-semibold text-white mt-3">نسبة الإنجاز العام</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 col-span-2">
                <h3 className="text-sm font-semibold text-white mb-3">الانحراف بين المخرجات</h3>
                <div className="space-y-3">
                  {[
                    { label: 'المنصة ↔ المصنع', value: Math.round((entries.reduce((s: number, e: any) => s + e.platVsFact, 0) / entries.length) * 10) / 10 },
                    { label: 'المنصة ↔ التوزيع', value: Math.round((entries.reduce((s: number, e: any) => s + e.platVsDist, 0) / entries.length) * 10) / 10 },
                    { label: 'المصنع ↔ التوزيع', value: Math.round((entries.reduce((s: number, e: any) => s + e.factVsDist, 0) / entries.length) * 10) / 10 },
                  ].map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02]">
                      <span className="text-xs text-gray-300">{d.label}</span>
                      <span className={cn('text-sm font-bold tabular-nums', Math.abs(d.value) > 15 ? 'text-red-400' : Math.abs(d.value) > 8 ? 'text-amber-400' : 'text-emerald-400')}>
                        {d.value > 0 ? '+' : ''}{d.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-white mb-4">المتوقع مقابل الفعلي</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar dataKey="الطاقة المتوقعة" fill="#8B5CF6" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="المنصة" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="المصنع" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="التوزيع" fill="#34D399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-white mb-4">اتجاه أداء التوزيع</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Line type="monotone" dataKey="نسبة الإنجاز" stroke="#38BDF8" strokeWidth={2.5} dot={{ r: 3, fill: '#38BDF8', strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="الفعلي" stroke="#34D399" strokeWidth={2} dot={{ r: 3, fill: '#34D399', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Data Table */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">البيانات التشغيلية</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['التاريخ', 'الهجري', 'شركات', 'دفعات', 'بطاقات/س', 'المتوقع', 'المنصة', 'المصنع', 'التوزيع', 'الإنجاز', 'الحالة', ''].map((h, i) => (
                    <th key={i} className="py-2.5 px-2 text-[10px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => {
                  const st = STATUS_MAP[e.status] || STATUS_MAP.warning;
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
