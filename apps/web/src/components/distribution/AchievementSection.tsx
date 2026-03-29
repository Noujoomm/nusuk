'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Plus, Trash2, Loader2, AlertTriangle, CheckCircle, TrendingUp, Target, X, Shield, Award } from 'lucide-react';
import DatePairInput from '@/components/ui/date-pair-input';
import toast from 'react-hot-toast';
import { distAchievementApi } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash, legendStyle } from '@/lib/chart-theme';

function Ring({ value, size = 110 }: { value: number; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  const color = value >= 100 ? '#34D399' : value >= 85 ? '#FBBF24' : '#F87171';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={c} strokeDashoffset={c - Math.min(1, value / 150) * c} strokeLinecap="round"
          className="transition-all duration-1000" style={value >= 100 ? { filter: `drop-shadow(0 0 8px ${color}88)` } : undefined} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-white">{value}%</span>
        {value >= 100 && <span className="text-[9px] text-emerald-400 font-medium">تجاوز الهدف</span>}
      </div>
    </div>
  );
}

const EMPTY = { gregorianDate: '', hijriDate: '', batch: '', companies: '', parcels: '', totalCards: '', cardsPerHour: '', duration: '4', specialists: '4' };

export default function AchievementSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try { const { data: d } = await distAchievementApi.dashboard(); setData(d); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Live preview
  const cph = parseInt(form.cardsPerHour) || 0;
  const dur = parseInt(form.duration) || 4;
  const spec = parseInt(form.specialists) || 4;
  const cards = parseInt(form.totalCards) || 0;
  const expected = cph * dur * spec;
  const previewPct = expected > 0 ? Math.round((cards / expected) * 1000) / 10 : 0;

  const submit = async () => {
    if (!form.gregorianDate || !form.hijriDate) { toast.error('التاريخ مطلوب'); return; }
    setSubmitting(true);
    try {
      await distAchievementApi.create({
        gregorianDate: form.gregorianDate, hijriDate: form.hijriDate, batch: form.batch,
        companies: parseInt(form.companies) || 0, parcels: parseInt(form.parcels) || 0,
        totalCards: cards, cardsPerHour: cph,
        duration: dur, specialists: spec,
      });
      toast.success('تم الحفظ — نسبة الإنجاز محسوبة تلقائياً');
      setShowForm(false); setForm(EMPTY); load();
    } catch { toast.error('فشل الحفظ'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  const entries = data?.entries || [];
  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/20"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
          <div><h2 className="text-base font-bold text-white">نسبة الإنجاز</h2><p className="text-[10px] text-gray-500">البيانات الخام فقط — النسب تُحسب تلقائياً</p></div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إدخال بيانات</button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">إدخال البيانات الخام</h3><button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button></div>
          <DatePairInput
            gregorianDate={form.gregorianDate} hijriDate={form.hijriDate}
            onGregorianChange={(v) => setForm({ ...form, gregorianDate: v })}
            onHijriChange={(v) => setForm({ ...form, hijriDate: v })}
            gregorianLabel="التاريخ" hijriLabel="الموافق"
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { k: 'batch', l: 'الدفعة', t: 'text', ph: 'الدفعة 1' },
              { k: 'cardsPerHour', l: 'البطاقات المسندة / أخصائي / ساعة', t: 'number' },
              { k: 'duration', l: 'المدة الزمنية (ساعات)', t: 'number' },
              { k: 'specialists', l: 'عدد أخصائيي التوزيع', t: 'number' },
              { k: 'totalCards', l: 'عدد البطاقات', t: 'number' },
              { k: 'parcels', l: 'عدد الطرود', t: 'number' },
              { k: 'companies', l: 'عدد الشركات', t: 'number' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                <input type={f.t} placeholder={f.ph || ''} value={(form as any)[f.k]} className={cn('input-field text-sm', f.k === 'cardsPerHour' && cph > 4000 && 'border-amber-500 ring-1 ring-amber-500/30')}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                {f.k === 'cardsPerHour' && cph > 4000 && <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> تحذير: تجاوز 4000</p>}
              </div>
            ))}
          </div>
          {cards > 0 && expected > 0 && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between">
              <div className="text-xs text-gray-400">
                المتوقع: <span className="text-white font-medium">{formatNumber(expected)}</span> = {formatNumber(cph)} × {dur} × {spec}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">نسبة الإنجاز:</span>
                <span className={cn('text-lg font-bold tabular-nums', previewPct >= 100 ? 'text-emerald-400' : previewPct >= 85 ? 'text-amber-400' : 'text-red-400')}>{previewPct}%</span>
              </div>
            </div>
          )}
          <div className="flex justify-end"><button onClick={submit} disabled={submitting} className="btn-primary px-6 py-2 text-sm disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</button></div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center"><TrendingUp className="w-10 h-10 text-gray-500 mx-auto mb-3" /><p className="text-sm text-gray-400">لا توجد بيانات إنجاز</p></div>
      ) : (<>
        {/* Summary */}
        {s && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 border-r-[3px] border-r-emerald-500">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/15 shrink-0"><Shield className="w-5 h-5 text-emerald-400" /></div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {s.avg >= 100 ? `أداء يتجاوز الخطة بنسبة ${s.avg}%.` : `نسبة الإنجاز ${s.avg}% من الهدف.`}
                {s.latestGap < 0 ? ` تجاوز الهدف بـ ${formatNumber(Math.abs(s.latestGap))} بطاقة.` : s.latestGap > 0 ? ` فجوة ${formatNumber(s.latestGap)} بطاقة عن الهدف.` : ''}
                {s.overLimitDays > 0 && ` ⚠️ ${s.overLimitDays} أيام تجاوزت 4000 بطاقة/ساعة.`}
              </p>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: 'نسبة الإنجاز', v: `${s.latest}%`, c: s.latest >= 100 ? '#34D399' : '#FBBF24', bg: s.latest >= 100 ? 'bg-emerald-500/20' : 'bg-amber-500/20', icon: TrendingUp },
              { l: 'الطاقة المتوقعة', v: formatNumber(s.totalExpected), c: '#8B5CF6', bg: 'bg-violet-500/20', icon: Target },
              { l: 'البطاقات الفعلية', v: formatNumber(s.totalCards), c: '#38BDF8', bg: 'bg-sky-500/20', icon: CheckCircle },
              { l: 'الفجوة', v: s.latestGap < 0 ? `+${formatNumber(Math.abs(s.latestGap))}` : formatNumber(s.latestGap), c: s.latestGap <= 0 ? '#34D399' : '#F87171', bg: s.latestGap <= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20', icon: Award },
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

        {/* Gauge + Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {s && <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 flex flex-col items-center justify-center"><Ring value={s.latest} /><p className="text-sm font-semibold text-white mt-3">أحدث إنجاز</p></div>}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-white mb-3">المتوقع مقابل الفعلي</h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={entries.slice(0, 10).reverse().map((e: any) => ({ name: e.hijriDate?.slice(-5) || '', 'المتوقع': e.expected, 'الفعلي': e.totalCards }))}>
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} /><XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} /><YAxis tick={axisTickStyle} stroke={axisStroke} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} /><Legend wrapperStyle={legendStyle} />
                <Bar dataKey="المتوقع" fill="#8B5CF6" fillOpacity={0.6} radius={[4, 4, 0, 0]} /><Bar dataKey="الفعلي" fill="#34D399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-white mb-3">اتجاه نسبة الإنجاز</h4>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={entries.slice(0, 15).reverse().map((e: any) => ({ name: e.hijriDate?.slice(-5) || '', 'الإنجاز': e.achievementPct }))}>
                <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} /><XAxis dataKey="name" tick={axisTickStyle} stroke={axisStroke} /><YAxis tick={axisTickStyle} stroke={axisStroke} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                <Line type="monotone" dataKey="الإنجاز" stroke="#34D399" strokeWidth={2.5} dot={{ r: 3, fill: '#34D399', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#34D399', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b border-white/10">
            {['التاريخ', 'الموافق', 'الدفعة', 'شركات', 'طرود', 'بطاقات', 'بطاقات/س', 'المدة', 'أخصائيين', 'المتوقع', 'الإنجاز %', ''].map((h, i) => <th key={i} className="py-2 px-2 text-[10px] text-gray-400 font-medium text-right whitespace-nowrap">{h}</th>)}
          </tr></thead><tbody>
            {entries.map((e: any) => (
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 px-2 text-xs text-gray-300 tabular-nums">{new Date(e.gregorianDate).toLocaleDateString('ar-SA')}</td>
                <td className="py-2 px-2 text-xs text-gray-300">{e.hijriDate}</td>
                <td className="py-2 px-2 text-xs text-gray-300">{e.batch || '—'}</td>
                <td className="py-2 px-2 text-xs text-white tabular-nums">{e.companies}</td>
                <td className="py-2 px-2 text-xs text-white tabular-nums">{e.parcels}</td>
                <td className="py-2 px-2 text-xs text-white tabular-nums">{formatNumber(e.totalCards)}</td>
                <td className={cn('py-2 px-2 text-xs tabular-nums', e.overLimit ? 'text-amber-400' : 'text-white')}>{formatNumber(e.cardsPerHour)}</td>
                <td className="py-2 px-2 text-xs text-gray-400">{e.duration}</td>
                <td className="py-2 px-2 text-xs text-gray-400">{e.specialists}</td>
                <td className="py-2 px-2 text-xs text-gray-300 tabular-nums">{formatNumber(e.expected)}</td>
                <td className={cn('py-2 px-2 text-xs font-bold tabular-nums', e.achievementPct >= 100 ? 'text-emerald-400' : e.achievementPct >= 85 ? 'text-amber-400' : 'text-red-400')}>{e.achievementPct}%</td>
                <td className="py-2 px-2"><button onClick={() => { distAchievementApi.delete(e.id).then(() => { toast.success('تم'); load(); }).catch(() => toast.error('فشل')); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </>)}
    </div>
  );
}
