'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Plus, Trash2, Loader2, AlertTriangle, CheckCircle, TrendingUp, Target, X, Shield, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { distAchievementApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

function Ring({ value, size = 110 }: { value: number; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  const fill = Math.min(1, value / 150);
  const color = value >= 100 ? '#34D399' : value >= 95 ? '#38BDF8' : value >= 85 ? '#FBBF24' : '#F87171';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - fill * c} strokeLinecap="round"
          className="transition-all duration-1000" style={value > 100 ? { filter: `drop-shadow(0 0 8px ${color}88)` } : undefined} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-white">{value}%</span>
        {value > 100 && <span className="text-[9px] text-emerald-400 font-medium">تجاوز الهدف</span>}
      </div>
    </div>
  );
}

export default function AchievementSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ gregorianDate: '', hijriDate: '', companies: '', batches: '', totalCards: '', cardsPerHour: '', achievementPct: '' });

  const load = useCallback(async () => {
    try { const { data: d } = await distAchievementApi.dashboard(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.gregorianDate || !form.hijriDate) { toast.error('التاريخ مطلوب'); return; }
    setSubmitting(true);
    try {
      await distAchievementApi.create({
        gregorianDate: form.gregorianDate, hijriDate: form.hijriDate,
        companies: parseInt(form.companies) || 0, batches: parseInt(form.batches) || 0,
        totalCards: parseInt(form.totalCards) || 0, cardsPerHour: parseInt(form.cardsPerHour) || 0,
        achievementPct: parseFloat(form.achievementPct) || 0,
      });
      toast.success('تم حفظ بيانات الإنجاز');
      setShowForm(false);
      setForm({ gregorianDate: '', hijriDate: '', companies: '', batches: '', totalCards: '', cardsPerHour: '', achievementPct: '' });
      load();
    } catch { toast.error('فشل الحفظ'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const entries = data?.entries || [];
  const s = data?.summary;

  const lineData = entries.slice(0, 15).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '', 'نسبة الإنجاز': e.achievementPct,
  }));
  const barData = entries.slice(0, 10).reverse().map((e: any) => ({
    name: e.hijriDate?.slice(-5) || '', 'البطاقات': e.totalCards, 'الشركات': e.companies * 100,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/20"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
          <h2 className="text-base font-bold text-white">نسبة الإنجاز — Achievement Percentage</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> إضافة بيانات الإنجاز
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">إدخال بيانات الإنجاز</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'gregorianDate', l: 'التاريخ الميلادي', t: 'date' },
              { k: 'hijriDate', l: 'التاريخ الهجري', t: 'text', ph: '1447/09/28' },
              { k: 'companies', l: 'عدد الشركات', t: 'number' },
              { k: 'batches', l: 'عدد الدُفعات', t: 'number' },
              { k: 'totalCards', l: 'إجمالي البطاقات', t: 'number' },
              { k: 'cardsPerHour', l: 'بطاقات/أخصائي/ساعة', t: 'number' },
              { k: 'achievementPct', l: 'نسبة الإنجاز %', t: 'number' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                <input type={f.t} placeholder={f.ph || ''} value={(form as any)[f.k]} className="input-field text-sm"
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 text-xs text-gray-500">المدة: 4 ساعات | الأخصائيون: 4 (ثابت)</div>
            <button onClick={submit} disabled={submitting} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center">
          <TrendingUp className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">لا توجد بيانات إنجاز بعد</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          {s && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-emerald-500">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/15 shrink-0"><Shield className="w-5 h-5 text-emerald-400" /></div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {s.avg >= 100 ? `أداء يفوق الهدف بنسبة ${s.avg}% — كفاءة تشغيلية ممتازة.` : `نسبة الإنجاز ${s.avg}% من الهدف.`}
                  {' '}{s.aboveTarget > 0 ? `${s.aboveTarget} أيام تجاوزت الهدف.` : ''}
                </p>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { l: 'أحدث إنجاز', v: `${s.latest}%`, c: '#34D399', bg: 'bg-emerald-500/20', icon: TrendingUp },
                { l: 'متوسط الإنجاز', v: `${s.avg}%`, c: '#38BDF8', bg: 'bg-sky-500/20', icon: Target },
                { l: 'أعلى إنجاز', v: `${s.highest}%`, c: '#A78BFA', bg: 'bg-violet-500/20', icon: Award },
                { l: 'إجمالي الشركات', v: formatNumber(s.totalCompanies), c: '#FBBF24', bg: 'bg-amber-500/20', icon: CheckCircle },
                { l: 'إجمالي الدُفعات', v: formatNumber(s.totalBatches), c: '#F87171', bg: 'bg-red-500/20', icon: CheckCircle },
                { l: 'إجمالي البطاقات', v: formatNumber(s.totalCards), c: '#2DD4BF', bg: 'bg-teal-500/20', icon: CheckCircle },
              ].map((k, i) => (
                <div key={i} className="analytics-card" style={{ borderBottom: `2px solid ${k.c}` }}>
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-xl', k.bg)}><k.icon className="w-4 h-4" style={{ color: k.c }} /></div>
                    <div><p className="text-lg font-bold text-white tabular-nums">{k.v}</p><p className="text-[10px] text-gray-400">{k.l}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gauge + Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {s && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center justify-center">
                <Ring value={s.avg} />
                <p className="text-sm font-semibold text-white mt-3">متوسط نسبة الإنجاز</p>
              </div>
            )}
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
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h4 className="text-sm font-semibold text-white mb-3">البطاقات والشركات</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} />
                  <YAxis tick={axisTickStyle} stroke={axisStroke} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar dataKey="البطاقات" fill="#34D399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="الشركات" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">سجل بيانات الإنجاز</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10">
                {['التاريخ', 'الهجري', 'شركات', 'دفعات', 'البطاقات', 'بطاقات/س', 'المدة', 'أخصائيين', 'الإنجاز', ''].map((h, i) => (
                  <th key={i} className="py-2 px-2 text-[10px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-2 text-xs text-gray-300 tabular-nums">{new Date(e.gregorianDate).toLocaleDateString('ar-SA')}</td>
                    <td className="py-2 px-2 text-xs text-gray-300">{e.hijriDate}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{e.companies}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{e.batches}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.totalCards)}</td>
                    <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.cardsPerHour)}</td>
                    <td className="py-2 px-2 text-xs text-gray-400">{e.duration}</td>
                    <td className="py-2 px-2 text-xs text-gray-400">{e.specialists}</td>
                    <td className={cn('py-2 px-2 text-xs font-bold tabular-nums', e.achievementPct >= 100 ? 'text-emerald-400' : e.achievementPct >= 85 ? 'text-amber-400' : 'text-red-400')}>{e.achievementPct}%</td>
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
    distAchievementApi.delete(id).then(() => { toast.success('تم الحذف'); load(); }).catch(() => toast.error('فشل الحذف'));
  }
}
