'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wallet, Plus, Trash2, Loader2, X, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, DollarSign, Receipt, ArrowLeftRight,
  BarChart3, RefreshCw, Eye, Package,
} from 'lucide-react';
import { supportServicesApi, tracksApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, axisTickStyle, axisStroke, gridStroke, gridStrokeDash } from '@/lib/chart-theme';
import toast from 'react-hot-toast';

const CATEGORY_AR: Record<string, string> = {
  OPERATIONAL_SUPPLIES: 'مستلزمات تشغيلية',
  EVENTS: 'فعاليات',
  TRACK_NEEDS: 'احتياجات المسار',
};
const SUB_CATEGORY_AR: Record<string, string> = {
  CLEANING: 'نظافة', BUFFET: 'ضيافة', OFFICE_SUPPLIES: 'مكتبية',
  PHOTOGRAPHY: 'تصوير', HOSPITALITY: 'ضيافة', OTHER: 'أخرى',
};
const STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشطة', LOW_BALANCE: 'رصيد منخفض', CLOSED: 'مغلقة', SETTLED: 'مسددة',
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-300',
  LOW_BALANCE: 'bg-amber-500/20 text-amber-300',
  CLOSED: 'bg-gray-500/20 text-gray-300',
  SETTLED: 'bg-blue-500/20 text-blue-300',
};
const PIE_COLORS = ['#10B981', '#6366f1', '#F59E0B', '#EC4899', '#14B8A6'];

type ViewMode = 'dashboard' | 'list' | 'detail' | 'create' | 'expense' | 'settlement';

export default function SupportServicesPage() {
  const { user } = useAuth();
  const isAdminOrPm = user?.role === 'admin' || user?.role === 'pm';
  const [view, setView] = useState<ViewMode>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [custodies, setCustodies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [custodyForm, setCustodyForm] = useState({ name: '', description: '', totalAmount: '', category: 'OPERATIONAL_SUPPLIES', subCategory: 'OTHER', trackId: '' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', description: '', notes: '' });
  const [settlementForm, setSettlementForm] = useState({ amount: '', date: '', reference: '', notes: '' });

  const loadDashboard = useCallback(async () => {
    try {
      const [dashRes, custRes, trackRes] = await Promise.all([
        supportServicesApi.dashboard(),
        supportServicesApi.listCustodies(),
        tracksApi.list(),
      ]);
      setDashboard(dashRes.data);
      setCustodies(custRes.data.data || []);
      setTracks(trackRes.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdminOrPm) loadDashboard(); }, [isAdminOrPm, loadDashboard]);

  const openDetail = useCallback(async (id: string) => {
    try {
      const { data } = await supportServicesApi.getCustody(id);
      setSelected(data);
      setView('detail');
    } catch { toast.error('فشل تحميل التفاصيل'); }
  }, []);

  const handleCreateCustody = async () => {
    if (!custodyForm.name || !custodyForm.totalAmount) { toast.error('الاسم والمبلغ مطلوبان'); return; }
    if (custodyForm.category === 'TRACK_NEEDS' && !custodyForm.trackId) { toast.error('اختر المسار'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.createCustody({
        ...custodyForm,
        totalAmount: parseFloat(custodyForm.totalAmount),
        trackId: custodyForm.trackId || undefined,
      });
      toast.success('تم إنشاء العهدة');
      setCustodyForm({ name: '', description: '', totalAmount: '', category: 'OPERATIONAL_SUPPLIES', subCategory: 'OTHER', trackId: '' });
      setView('dashboard');
      loadDashboard();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل الإنشاء'); } finally { setSubmitting(false); }
  };

  const handleAddExpense = async () => {
    if (!expenseForm.amount || !expenseForm.description) { toast.error('المبلغ والوصف مطلوبان'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.addExpense({
        custodyId: selected.id,
        amount: parseFloat(expenseForm.amount),
        description: expenseForm.description,
        notes: expenseForm.notes || undefined,
      });
      toast.success('تم تسجيل الصرف');
      setExpenseForm({ amount: '', description: '', notes: '' });
      openDetail(selected.id);
      loadDashboard();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleAddSettlement = async () => {
    if (!settlementForm.amount || !settlementForm.date) { toast.error('المبلغ والتاريخ مطلوبان'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.addSettlement({
        custodyId: selected.id,
        amount: parseFloat(settlementForm.amount),
        date: settlementForm.date,
        reference: settlementForm.reference || undefined,
        notes: settlementForm.notes || undefined,
      });
      toast.success('تم تسجيل التسديد');
      setSettlementForm({ amount: '', date: '', reference: '', notes: '' });
      openDetail(selected.id);
      loadDashboard();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  if (!isAdminOrPm) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Wallet className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط للإدارة ومديري المشاريع</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = dashboard;

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">خدمات مساندة</h1>
          <p className="text-gray-400 mt-1 text-sm">نظام إدارة العهد والصرف</p>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'dashboard' && (
            <button onClick={() => { setView('dashboard'); setSelected(null); }} className="btn-secondary text-sm">← الرئيسية</button>
          )}
          <button onClick={() => setView('create')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> عهدة جديدة
          </button>
          <button onClick={loadDashboard} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ═══════ DASHBOARD VIEW ═══════ */}
      {view === 'dashboard' && d && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي العهد', value: d.totalCustodies, icon: Wallet, color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
              { label: 'إجمالي الميزانية', value: formatNumber(Math.round(d.totalBudget)), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/20', suffix: ' ريال' },
              { label: 'إجمالي المصروف', value: formatNumber(Math.round(d.totalSpent)), icon: TrendingDown, color: 'text-amber-400', bg: 'bg-amber-500/20', suffix: ' ريال' },
              { label: 'رصيد منخفض', value: d.lowBalanceCount, icon: AlertTriangle, color: d.lowBalanceCount > 0 ? 'text-red-400' : 'text-emerald-400', bg: d.lowBalanceCount > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20' },
            ].map((c) => (
              <div key={c.label} className="analytics-card">
                <div className="flex items-center gap-3">
                  <div className={cn('p-2.5 rounded-xl', c.bg)}><c.icon className={cn('w-5 h-5', c.color)} /></div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">{c.value}{(c as any).suffix || ''}</p>
                    <p className="text-xs text-gray-400">{c.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {d.byCategory?.length > 0 && (
              <div className="glass p-5">
                <h3 className="text-sm font-semibold mb-4 text-gray-300">الصرف حسب الفئة</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={d.byCategory.map((c: any) => ({ name: CATEGORY_AR[c.category] || c.category, value: Math.round(c.spent) }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                      {d.byCategory.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11, direction: 'rtl' as const }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {d.monthlySpending?.length > 0 && (
              <div className="glass p-5">
                <h3 className="text-sm font-semibold mb-4 text-gray-300">الصرف الشهري</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={d.monthlySpending}>
                    <XAxis dataKey="month" tick={axisTickStyle} stroke={axisStroke} />
                    <YAxis tick={axisTickStyle} stroke={axisStroke} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                    <Bar dataKey="amount" name="المصروف" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Track Distribution + Budget Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {d.byTrack?.length > 0 && (
              <div className="glass p-5">
                <h3 className="text-sm font-semibold mb-4 text-gray-300">توزيع الصرف حسب المسار</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={d.byTrack.map((t: any) => ({ name: t.trackName, value: Math.round(t.spent) }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                      {d.byTrack.map((t: any, i: number) => <Cell key={i} fill={t.trackColor || PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11, direction: 'rtl' as const }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {d.monthlySpending?.length > 1 && (
              <div className="glass p-5">
                <h3 className="text-sm font-semibold mb-4 text-gray-300">اتجاه الصرف الشهري</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={d.monthlySpending}>
                    <CartesianGrid strokeDasharray={gridStrokeDash} stroke={gridStroke} />
                    <XAxis dataKey="month" tick={axisTickStyle} stroke={axisStroke} />
                    <YAxis tick={axisTickStyle} stroke={axisStroke} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
                    <Line type="monotone" dataKey="amount" name="المصروف" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3, fill: '#8B5CF6' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Custody List */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold mb-4 text-gray-300">قائمة العهد</h3>
            {custodies.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12">لا توجد عهد — أنشئ عهدة جديدة</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['العهدة', 'المسار', 'الفئة', 'الميزانية', 'المصروف', 'المتبقي', 'النسبة', 'الحالة', ''].map((h) => (
                        <th key={h} className="py-3 px-3 text-gray-400 font-medium text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {custodies.map((c: any) => {
                      const pct = c.totalAmount > 0 ? Math.round((c.spentAmount / c.totalAmount) * 100) : 0;
                      return (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-3 font-medium">{c.name}</td>
                          <td className="py-3 px-3">
                            {c.track ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${c.track.color}20`, color: c.track.color }}>{c.track.nameAr}</span>
                            ) : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-3 px-3 text-gray-400">{CATEGORY_AR[c.category] || c.category}</td>
                          <td className="py-3 px-3 tabular-nums">{formatNumber(Math.round(c.totalAmount))}</td>
                          <td className="py-3 px-3 tabular-nums text-amber-400">{formatNumber(Math.round(c.spentAmount))}</td>
                          <td className="py-3 px-3 tabular-nums text-emerald-400">{formatNumber(Math.round(c.remainingAmount))}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{
                                  width: `${pct}%`,
                                  background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e',
                                }} />
                              </div>
                              <span className="text-xs text-gray-400 tabular-nums">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={cn('text-[10px] px-2 py-0.5 rounded-full', STATUS_COLORS[c.status])}>{STATUS_AR[c.status]}</span>
                          </td>
                          <td className="py-3 px-3">
                            <button onClick={() => openDetail(c.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400">
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════ CREATE CUSTODY ═══════ */}
      {view === 'create' && (
        <div className="glass p-6 max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-bold">إنشاء عهدة جديدة</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">اسم العهدة *</label>
              <input value={custodyForm.name} onChange={(e) => setCustodyForm({ ...custodyForm, name: e.target.value })} className="input-field" placeholder="مثال: عهدة النظافة" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">الوصف</label>
              <textarea value={custodyForm.description} onChange={(e) => setCustodyForm({ ...custodyForm, description: e.target.value })} className="input-field resize-none" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">المبلغ الكلي (ريال) *</label>
                <input type="number" min={0} value={custodyForm.totalAmount} onChange={(e) => setCustodyForm({ ...custodyForm, totalAmount: e.target.value })} className="input-field" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">الفئة *</label>
                <select value={custodyForm.category} onChange={(e) => setCustodyForm({ ...custodyForm, category: e.target.value })} className="input-field">
                  <option value="OPERATIONAL_SUPPLIES">مستلزمات تشغيلية</option>
                  <option value="EVENTS">فعاليات</option>
                  <option value="TRACK_NEEDS">احتياجات المسار</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">الفئة الفرعية</label>
                <select value={custodyForm.subCategory} onChange={(e) => setCustodyForm({ ...custodyForm, subCategory: e.target.value })} className="input-field">
                  {Object.entries(SUB_CATEGORY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {custodyForm.category === 'TRACK_NEEDS' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">المسار *</label>
                  <select value={custodyForm.trackId} onChange={(e) => setCustodyForm({ ...custodyForm, trackId: e.target.value })} className="input-field">
                    <option value="">اختر المسار</option>
                    {tracks.map((t: any) => <option key={t.id} value={t.id}>{t.nameAr}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setView('dashboard')} className="btn-secondary">إلغاء</button>
            <button onClick={handleCreateCustody} disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════ DETAIL VIEW ═══════ */}
      {view === 'detail' && selected && (
        <div className="space-y-4">
          {/* Custody Header */}
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{selected.name}</h2>
                <p className="text-xs text-gray-400">{CATEGORY_AR[selected.category]} — {SUB_CATEGORY_AR[selected.subCategory] || 'أخرى'}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.track && (
                  <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: `${selected.track.color}20`, color: selected.track.color }}>{selected.track.nameAr}</span>
                )}
                <span className={cn('text-xs px-3 py-1 rounded-full', STATUS_COLORS[selected.status])}>{STATUS_AR[selected.status]}</span>
              </div>
            </div>
            {selected.description && <p className="text-sm text-gray-300 mb-4">{selected.description}</p>}

            {/* Financial Progress */}
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                <p className="text-lg font-bold tabular-nums text-white">{formatNumber(Math.round(selected.totalAmount))}</p>
                <p className="text-[10px] text-gray-500">الميزانية</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                <p className="text-lg font-bold tabular-nums text-amber-400">{formatNumber(Math.round(selected.spentAmount))}</p>
                <p className="text-[10px] text-gray-500">المصروف</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                <p className="text-lg font-bold tabular-nums text-emerald-400">{formatNumber(Math.round(selected.remainingAmount))}</p>
                <p className="text-[10px] text-gray-500">المتبقي</p>
              </div>
            </div>

            {/* Progress bar */}
            {(() => {
              const pct = selected.totalAmount > 0 ? Math.round((selected.spentAmount / selected.totalAmount) * 100) : 0;
              const barColor = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e';
              return (
                <div>
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>المصروف: {pct}%</span>
                    <span>المتبقي: {100 - pct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setExpenseForm({ amount: '', description: '', notes: '' }); setView('expense'); }}
                className="btn-primary text-sm flex items-center gap-1.5" disabled={selected.status === 'CLOSED' || selected.status === 'SETTLED'}>
                <Receipt className="w-4 h-4" /> تسجيل صرف
              </button>
              <button onClick={() => { setSettlementForm({ amount: '', date: '', reference: '', notes: '' }); setView('settlement'); }}
                className="btn-secondary text-sm flex items-center gap-1.5">
                <ArrowLeftRight className="w-4 h-4" /> تسجيل تسديد
              </button>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">سجل الصرف ({selected.expenses?.length || 0})</h3>
            {selected.expenses?.length > 0 ? (
              <div className="space-y-2">
                {selected.expenses.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div>
                      <p className="text-sm font-medium">{e.description}</p>
                      <p className="text-[10px] text-gray-500">{e.createdBy?.nameAr} — {new Date(e.createdAt).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums text-amber-400">{formatNumber(Math.round(e.amount))} ريال</span>
                      <button onClick={async () => {
                        try { await supportServicesApi.deleteExpense(e.id); toast.success('تم'); openDetail(selected.id); loadDashboard(); }
                        catch { toast.error('فشل'); }
                      }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500 text-center py-6">لا يوجد صرف مسجل</p>}
          </div>

          {/* Settlements Table */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">سجل التسديد ({selected.settlements?.length || 0})</h3>
            {selected.settlements?.length > 0 ? (
              <div className="space-y-2">
                {selected.settlements.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div>
                      <p className="text-sm font-medium">{s.reference || 'تسديد'}</p>
                      <p className="text-[10px] text-gray-500">{new Date(s.date).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-blue-400">{formatNumber(Math.round(s.amount))} ريال</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500 text-center py-6">لا يوجد تسديد</p>}
          </div>

          {/* Attachments Section */}
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300">المرفقات ({selected.attachments?.length || 0})</h3>
              <div className="flex gap-2">
                {selected.attachments?.length > 0 && (
                  <button onClick={async () => {
                    try {
                      const res = await supportServicesApi.downloadAllZip(selected.id);
                      const href = URL.createObjectURL(res.data);
                      const a = document.createElement('a'); a.href = href; a.download = `مرفقات-${selected.name}.zip`;
                      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(href);
                    } catch { toast.error('فشل التحميل'); }
                  }} className="btn-secondary text-xs flex items-center gap-1">
                    <Package className="w-3 h-3" /> تحميل الكل ZIP
                  </button>
                )}
                <label className="btn-primary text-xs flex items-center gap-1 cursor-pointer">
                  <Plus className="w-3 h-3" /> رفع ملفات
                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;
                    try {
                      await supportServicesApi.uploadFiles(selected.id, files);
                      toast.success(`تم رفع ${files.length} ملف`);
                      openDetail(selected.id);
                    } catch { toast.error('فشل الرفع'); }
                    e.target.value = '';
                  }} />
                </label>
              </div>
            </div>
            {selected.attachments?.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {selected.attachments.map((att: any) => {
                  const isImage = att.mimeType?.startsWith('image/');
                  return (
                    <div key={att.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2 group relative">
                      {isImage ? (
                        <div className="h-24 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center">
                          <img src={`/uploads/support-services/${att.filePath.split('/').pop()}`} alt={att.fileName} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-24 rounded-lg bg-gray-900 flex items-center justify-center">
                          <Receipt className="w-8 h-8 text-gray-500" />
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1.5 truncate">{att.fileName}</p>
                      <button onClick={async () => {
                        try { await supportServicesApi.deleteAttachment(att.id); toast.success('تم'); openDetail(selected.id); }
                        catch { toast.error('فشل'); }
                      }} className="absolute top-1 left-1 p-1 rounded-lg bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-gray-500 text-center py-6">لا توجد مرفقات</p>}
          </div>
        </div>
      )}

      {/* ═══════ ADD EXPENSE ═══════ */}
      {view === 'expense' && selected && (
        <div className="glass p-6 max-w-lg mx-auto space-y-4">
          <h2 className="text-lg font-bold">تسجيل صرف — {selected.name}</h2>
          <p className="text-xs text-gray-400">المتبقي: <span className="text-emerald-400 font-bold">{formatNumber(Math.round(selected.remainingAmount))} ريال</span></p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">المبلغ (ريال) *</label>
            <input type="number" min={0} value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="input-field" dir="ltr" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">الوصف *</label>
            <input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="input-field" placeholder="وصف الصرف" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ملاحظات</label>
            <textarea value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} className="input-field resize-none" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setView('detail')} className="btn-secondary">إلغاء</button>
            <button onClick={handleAddExpense} disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الصرف'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════ ADD SETTLEMENT ═══════ */}
      {view === 'settlement' && selected && (
        <div className="glass p-6 max-w-lg mx-auto space-y-4">
          <h2 className="text-lg font-bold">تسجيل تسديد — {selected.name}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">المبلغ (ريال) *</label>
              <input type="number" min={0} value={settlementForm.amount} onChange={(e) => setSettlementForm({ ...settlementForm, amount: e.target.value })} className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">التاريخ *</label>
              <input type="date" value={settlementForm.date} onChange={(e) => setSettlementForm({ ...settlementForm, date: e.target.value })} className="input-field" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">المرجع</label>
            <input value={settlementForm.reference} onChange={(e) => setSettlementForm({ ...settlementForm, reference: e.target.value })} className="input-field" placeholder="رقم الإيصال" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">ملاحظات</label>
            <textarea value={settlementForm.notes} onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })} className="input-field resize-none" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setView('detail')} className="btn-secondary">إلغاء</button>
            <button onClick={handleAddSettlement} disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ التسديد'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
