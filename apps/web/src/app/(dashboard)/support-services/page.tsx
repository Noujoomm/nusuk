'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wallet, Plus, Trash2, Loader2, X, AlertTriangle, CheckCircle,
  TrendingDown, DollarSign, Receipt, Eye, Users, ClipboardList,
  RefreshCw, Lock, FileText, UserPlus, Shield,
} from 'lucide-react';
import { supportServicesApi, usersApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

const STATUS_AR: Record<string, string> = { ACTIVE: 'نشطة', LOW_BALANCE: 'رصيد منخفض', SUSPENDED: 'معلقة', CLOSED: 'مقفلة' };
const STATUS_CLS: Record<string, string> = { ACTIVE: 'bg-emerald-500/20 text-emerald-300', LOW_BALANCE: 'bg-amber-500/20 text-amber-300', SUSPENDED: 'bg-yellow-500/20 text-yellow-300', CLOSED: 'bg-red-500/20 text-red-300' };
const INVOICE_STATUS_AR: Record<string, string> = { UPLOADED: 'مرفوعة', APPROVED: 'معتمدة', REJECTED: 'مرفوضة' };
const INVOICE_CLS: Record<string, string> = { UPLOADED: 'bg-blue-500/20 text-blue-300', APPROVED: 'bg-emerald-500/20 text-emerald-300', REJECTED: 'bg-red-500/20 text-red-300' };
const ROLE_AR: Record<string, string> = { manager: 'مدير', custodian: 'مسؤول عهدة', executor: 'منفذ', viewer: 'مراقب' };

type Tab = 'dashboard' | 'custodies' | 'invoices' | 'members' | 'logs';

export default function SupportServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'pm';
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [dashboard, setDashboard] = useState<any>(null);
  const [custodies, setCustodies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Forms
  const [showCustodyForm, setShowCustodyForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [custodyForm, setCustodyForm] = useState({ name: '', description: '', initialBalance: '', balanceAddedAt: '', assignedToId: '', notes: '' });
  const [invoiceForm, setInvoiceForm] = useState({ custodyId: '', name: '', description: '', amount: '', invoiceDate: '', invoiceNumber: '' });
  const [memberForm, setMemberForm] = useState({ custodyId: '', userId: '', roleType: 'viewer' });
  const [closeNotes, setCloseNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([supportServicesApi.dashboard(), supportServicesApi.listCustodies()]);
      setDashboard(d.data);
      setCustodies(c.data.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadInvoices = useCallback(async () => {
    try { const { data } = await supportServicesApi.listInvoices({ pageSize: 200 }); setInvoices(data.data || []); } catch {}
  }, []);

  const loadLogs = useCallback(async () => {
    try { const { data } = await supportServicesApi.getAuditLogs(undefined, 200); setLogs(data || []); } catch {}
  }, []);

  const loadUsers = useCallback(async () => {
    try { const { data } = await usersApi.list({ pageSize: 200 }); setAllUsers(data.data || data || []); } catch {}
  }, []);

  useEffect(() => { if (isAdmin) { load(); loadUsers(); } }, [isAdmin, load, loadUsers]);
  useEffect(() => { if (tab === 'invoices') loadInvoices(); }, [tab, loadInvoices]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  const openDetail = useCallback(async (id: string) => {
    try { const { data } = await supportServicesApi.getCustody(id); setSelected(data); } catch { toast.error('فشل تحميل العهدة'); }
  }, []);

  // ── Handlers ──
  const handleCreateCustody = async () => {
    if (!custodyForm.name || !custodyForm.initialBalance || !custodyForm.balanceAddedAt) { toast.error('الاسم والرصيد والتاريخ مطلوبة'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.createCustody({ ...custodyForm, initialBalance: parseFloat(custodyForm.initialBalance), assignedToId: custodyForm.assignedToId || undefined });
      toast.success('تم إنشاء العهدة');
      setShowCustodyForm(false);
      setCustodyForm({ name: '', description: '', initialBalance: '', balanceAddedAt: '', assignedToId: '', notes: '' });
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleCreateInvoice = async () => {
    if (!invoiceForm.custodyId || !invoiceForm.name || !invoiceForm.amount || !invoiceForm.invoiceDate) { toast.error('جميع الحقول الأساسية مطلوبة'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.createInvoice({ ...invoiceForm, amount: parseFloat(invoiceForm.amount) });
      toast.success('تم إضافة الفاتورة');
      setShowInvoiceForm(false);
      setInvoiceForm({ custodyId: '', name: '', description: '', amount: '', invoiceDate: '', invoiceNumber: '' });
      load(); loadInvoices();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleAddMember = async () => {
    if (!memberForm.custodyId || !memberForm.userId) { toast.error('اختر العهدة والمستخدم'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.addMember(memberForm);
      toast.success('تم إضافة العضو');
      setShowMemberForm(false);
      setMemberForm({ custodyId: '', userId: '', roleType: 'viewer' });
      if (selected) openDetail(selected.id);
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleClose = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await supportServicesApi.closeCustody(selected.id, { closingNotes: closeNotes });
      toast.success('تم إقفال العهدة');
      setShowCloseDialog(false);
      setCloseNotes('');
      setSelected(null);
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  if (!isAdmin) return <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400"><Shield className="h-12 w-12" /><p className="text-sm">غير مصرح بالوصول</p></div>;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  const d = dashboard;
  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'dashboard', label: 'الرئيسية', icon: Wallet },
    { key: 'custodies', label: 'العهد', icon: DollarSign },
    { key: 'invoices', label: 'الفواتير', icon: Receipt },
    { key: 'members', label: 'الأشخاص', icon: Users },
    { key: 'logs', label: 'السجل', icon: ClipboardList },
  ];

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">خدمات المساندة</h1><p className="text-gray-400 mt-1 text-sm">نظام إدارة العهد والفواتير</p></div>
        <button onClick={load} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06] w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); }}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === t.key ? 'bg-brand-500/15 text-brand-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD TAB ═══ */}
      {tab === 'dashboard' && d && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'العهد النشطة', value: d.activeCustodies, icon: Wallet, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
            { label: 'العهد المقفلة', value: d.closedCustodies, icon: Lock, color: 'text-red-400', bg: 'bg-red-500/20' },
            { label: 'إجمالي الرصيد', value: `${formatNumber(Math.round(d.totalBudget))}`, icon: DollarSign, color: 'text-sky-400', bg: 'bg-sky-500/20' },
            { label: 'إجمالي المصروفات', value: `${formatNumber(Math.round(d.totalSpent))}`, icon: TrendingDown, color: 'text-amber-400', bg: 'bg-amber-500/20' },
            { label: 'الرصيد المتبقي', value: `${formatNumber(Math.round(d.totalRemaining))}`, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
            { label: 'رصيد منخفض', value: d.lowBalanceCustodies, icon: AlertTriangle, color: d.lowBalanceCustodies > 0 ? 'text-red-400' : 'text-gray-400', bg: d.lowBalanceCustodies > 0 ? 'bg-red-500/20' : 'bg-white/5' },
            { label: 'إجمالي الفواتير', value: d.totalInvoices, icon: Receipt, color: 'text-violet-400', bg: 'bg-violet-500/20' },
            { label: 'مبلغ الفواتير', value: `${formatNumber(Math.round(d.totalInvoiceAmount))}`, icon: FileText, color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
          ].map((c) => (
            <div key={c.label} className="analytics-card">
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', c.bg)}><c.icon className={cn('w-5 h-5', c.color)} /></div>
                <div><p className="text-lg font-bold tabular-nums">{c.value}</p><p className="text-xs text-gray-400">{c.label}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ CUSTODIES TAB ═══ */}
      {tab === 'custodies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCustodyForm(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> عهدة جديدة</button>
          </div>

          {/* Create Form */}
          {showCustodyForm && (
            <div className="glass p-5 space-y-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-bold">إنشاء عهدة جديدة</h3><button onClick={() => setShowCustodyForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">اسم العهدة *</label><input value={custodyForm.name} onChange={(e) => setCustodyForm({ ...custodyForm, name: e.target.value })} className="input-field" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">الرصيد الأساسي (ريال) *</label><input type="number" min={0} value={custodyForm.initialBalance} onChange={(e) => setCustodyForm({ ...custodyForm, initialBalance: e.target.value })} className="input-field" dir="ltr" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">تاريخ إضافة الرصيد *</label><input type="date" value={custodyForm.balanceAddedAt} onChange={(e) => setCustodyForm({ ...custodyForm, balanceAddedAt: e.target.value })} className="input-field" dir="ltr" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">مسؤول العهدة</label>
                  <select value={custodyForm.assignedToId} onChange={(e) => setCustodyForm({ ...custodyForm, assignedToId: e.target.value })} className="input-field">
                    <option value="">— اختر —</option>
                    {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr || u.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">وصف</label><textarea value={custodyForm.description} onChange={(e) => setCustodyForm({ ...custodyForm, description: e.target.value })} className="input-field resize-none" rows={2} /></div>
              <div><label className="block text-xs text-gray-400 mb-1">ملاحظات</label><textarea value={custodyForm.notes} onChange={(e) => setCustodyForm({ ...custodyForm, notes: e.target.value })} className="input-field resize-none" rows={2} /></div>
              <div className="flex justify-end"><button onClick={handleCreateCustody} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء'}</button></div>
            </div>
          )}

          {/* Custodies Table */}
          {!selected ? (
            <div className="glass p-5 overflow-x-auto">
              {custodies.length === 0 ? <p className="text-sm text-gray-500 text-center py-12">لا توجد عهد</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10">
                    {['الرقم', 'العهدة', 'المسؤول', 'الرصيد', 'المصروف', 'المتبقي', '%', 'الحالة', ''].map((h) => <th key={h} className="py-3 px-2 text-gray-400 font-medium text-right">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {custodies.map((c: any) => {
                      const pct = c.initialBalance > 0 ? Math.round((c.spentAmount / c.initialBalance) * 100) : 0;
                      return (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                          <td className="py-2.5 px-2 text-gray-500 text-xs tabular-nums">{c.code?.slice(-6)}</td>
                          <td className="py-2.5 px-2 font-medium">{c.name}</td>
                          <td className="py-2.5 px-2 text-gray-400">{c.assignedTo?.nameAr || '—'}</td>
                          <td className="py-2.5 px-2 tabular-nums">{formatNumber(Math.round(c.initialBalance))}</td>
                          <td className="py-2.5 px-2 tabular-nums text-amber-400">{formatNumber(Math.round(c.spentAmount))}</td>
                          <td className="py-2.5 px-2 tabular-nums text-emerald-400">{formatNumber(Math.round(c.currentBalance))}</td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e' }} /></div>
                              <span className="text-[10px] text-gray-400 tabular-nums">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2"><span className={cn('text-[10px] px-2 py-0.5 rounded-full', STATUS_CLS[c.status])}>{STATUS_AR[c.status]}</span></td>
                          <td className="py-2.5 px-2"><button onClick={() => openDetail(c.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"><Eye className="w-4 h-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            /* ── Custody Detail ── */
            <div className="space-y-4">
              <button onClick={() => setSelected(null)} className="btn-secondary text-sm">← العودة للقائمة</button>
              <div className="glass p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold">{selected.name}</h2>
                      <span className="text-[10px] text-gray-500 tabular-nums">{selected.code}</span>
                    </div>
                    <p className="text-xs text-gray-400">{selected.description || ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected.assignedTo && <span className="text-xs text-gray-400">المسؤول: <span className="text-white">{selected.assignedTo.nameAr}</span></span>}
                    <span className={cn('text-xs px-3 py-1 rounded-full', STATUS_CLS[selected.status])}>{STATUS_AR[selected.status]}</span>
                  </div>
                </div>
                {selected.status === 'CLOSED' && selected.closedBy && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                    مقفلة بتاريخ {new Date(selected.closedAt).toLocaleDateString('ar-SA-u-nu-latn')} بواسطة {selected.closedBy.nameAr}
                    {selected.closingNotes && <span className="block mt-1 text-gray-400">{selected.closingNotes}</span>}
                  </div>
                )}
                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 rounded-xl bg-white/[0.03]"><p className="text-lg font-bold tabular-nums">{formatNumber(Math.round(selected.initialBalance))}</p><p className="text-[10px] text-gray-500">الرصيد الأساسي</p></div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03]"><p className="text-lg font-bold tabular-nums text-amber-400">{formatNumber(Math.round(selected.spentAmount))}</p><p className="text-[10px] text-gray-500">المصروف</p></div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03]"><p className="text-lg font-bold tabular-nums text-emerald-400">{formatNumber(Math.round(selected.currentBalance))}</p><p className="text-[10px] text-gray-500">المتبقي</p></div>
                </div>
                {/* Progress */}
                {(() => { const pct = selected.initialBalance > 0 ? Math.round((selected.spentAmount / selected.initialBalance) * 100) : 0; return (
                  <div className="mb-4">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>المصروف: {pct}%</span><span>المتبقي: {100 - pct}%</span></div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e' }} /></div>
                  </div>
                ); })()}
                {/* Actions */}
                {selected.status !== 'CLOSED' && (
                  <div className="flex gap-2">
                    <button onClick={() => { setInvoiceForm({ ...invoiceForm, custodyId: selected.id }); setShowInvoiceForm(true); }} className="btn-primary text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4" /> إضافة فاتورة</button>
                    <button onClick={() => { setMemberForm({ ...memberForm, custodyId: selected.id }); setShowMemberForm(true); }} className="btn-secondary text-sm flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> إضافة عضو</button>
                    <button onClick={() => setShowCloseDialog(true)} className="btn-danger text-sm flex items-center gap-1.5"><Lock className="w-4 h-4" /> إقفال العهدة</button>
                  </div>
                )}
              </div>

              {/* Invoices */}
              <div className="glass p-5">
                <h3 className="text-sm font-semibold mb-3 text-gray-300">الفواتير ({selected.invoices?.length || 0})</h3>
                {selected.invoices?.length > 0 ? (
                  <div className="space-y-2">
                    {selected.invoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div>
                          <p className="text-sm font-medium">{inv.name}</p>
                          <p className="text-[10px] text-gray-500">{inv.createdBy?.nameAr} — {new Date(inv.invoiceDate).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', INVOICE_CLS[inv.status])}>{INVOICE_STATUS_AR[inv.status]}</span>
                          <span className="text-sm font-bold tabular-nums text-amber-400">{formatNumber(Math.round(inv.amount))} ريال</span>
                          {selected.status !== 'CLOSED' && inv.status === 'UPLOADED' && (
                            <div className="flex gap-1">
                              <button onClick={async () => { await supportServicesApi.updateInvoiceStatus(inv.id, 'APPROVED'); toast.success('تم الاعتماد'); openDetail(selected.id); load(); }} className="p-1 rounded-lg hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-300" title="اعتماد"><CheckCircle className="w-3.5 h-3.5" /></button>
                              <button onClick={async () => { await supportServicesApi.updateInvoiceStatus(inv.id, 'REJECTED'); toast.success('تم الرفض'); openDetail(selected.id); load(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300" title="رفض"><X className="w-3.5 h-3.5" /></button>
                              <button onClick={async () => { await supportServicesApi.deleteInvoice(inv.id); toast.success('تم الحذف'); openDetail(selected.id); load(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-500 text-center py-6">لا توجد فواتير</p>}
              </div>

              {/* Members */}
              <div className="glass p-5">
                <h3 className="text-sm font-semibold mb-3 text-gray-300">الأشخاص المعينون ({selected.members?.length || 0})</h3>
                {selected.members?.length > 0 ? (
                  <div className="space-y-2">
                    {selected.members.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-300">{m.user?.nameAr?.charAt(0) || '?'}</div>
                          <div><p className="text-sm font-medium">{m.user?.nameAr || m.user?.name}</p><p className="text-[10px] text-gray-500">{m.user?.email}</p></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300">{ROLE_AR[m.roleType] || m.roleType}</span>
                          {selected.status !== 'CLOSED' && (
                            <button onClick={async () => { await supportServicesApi.removeMember(selected.id, m.id); toast.success('تم الإزالة'); openDetail(selected.id); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-500 text-center py-6">لم يتم تعيين أشخاص</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ INVOICES TAB ═══ */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => setShowInvoiceForm(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إضافة فاتورة</button></div>
          <div className="glass p-5 overflow-x-auto">
            {invoices.length === 0 ? <p className="text-sm text-gray-500 text-center py-12">لا توجد فواتير</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10">
                  {['الفاتورة', 'العهدة', 'المبلغ', 'التاريخ', 'أضيفت بواسطة', 'الحالة'].map((h) => <th key={h} className="py-3 px-2 text-gray-400 font-medium text-right">{h}</th>)}
                </tr></thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-2 font-medium">{inv.name}{inv.invoiceNumber && <span className="text-gray-500 text-[10px] mr-1">#{inv.invoiceNumber}</span>}</td>
                      <td className="py-2.5 px-2 text-gray-400">{inv.custody?.name || '—'}</td>
                      <td className="py-2.5 px-2 tabular-nums text-amber-400">{formatNumber(Math.round(inv.amount))} ريال</td>
                      <td className="py-2.5 px-2 text-gray-400 tabular-nums">{new Date(inv.invoiceDate).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</td>
                      <td className="py-2.5 px-2 text-gray-400">{inv.createdBy?.nameAr || '—'}</td>
                      <td className="py-2.5 px-2"><span className={cn('text-[10px] px-2 py-0.5 rounded-full', INVOICE_CLS[inv.status])}>{INVOICE_STATUS_AR[inv.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ MEMBERS TAB ═══ */}
      {tab === 'members' && (
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">الأشخاص المعينون على العهد</h3>
          <p className="text-sm text-gray-500 text-center py-8">اختر عهدة من تبويب "العهد" لعرض وإدارة الأشخاص المعينين عليها</p>
        </div>
      )}

      {/* ═══ LOGS TAB ═══ */}
      {tab === 'logs' && (
        <div className="glass p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">سجل العمليات ({logs.length})</h3>
          {logs.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">لا توجد عمليات مسجلة</p> : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {logs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="p-1.5 rounded-lg bg-white/5"><ClipboardList className="w-3.5 h-3.5 text-gray-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{log.action} — {log.entityType}</span>
                      <span className="text-[10px] text-gray-500">{new Date(log.createdAt).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[10px] text-gray-500">{log.user?.nameAr} — {log.custody?.name || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Invoice Form Modal */}
      {showInvoiceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold">إضافة فاتورة</h3><button onClick={() => setShowInvoiceForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
            <div><label className="block text-xs text-gray-400 mb-1">العهدة *</label>
              <select value={invoiceForm.custodyId} onChange={(e) => setInvoiceForm({ ...invoiceForm, custodyId: e.target.value })} className="input-field">
                <option value="">— اختر العهدة —</option>
                {custodies.filter((c: any) => c.status !== 'CLOSED').map((c: any) => <option key={c.id} value={c.id}>{c.name} ({formatNumber(Math.round(c.currentBalance))} ريال)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-400 mb-1">اسم الفاتورة *</label><input value={invoiceForm.name} onChange={(e) => setInvoiceForm({ ...invoiceForm, name: e.target.value })} className="input-field" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">المبلغ (ريال) *</label><input type="number" min={0} value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} className="input-field" dir="ltr" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-400 mb-1">تاريخ الفاتورة *</label><input type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} className="input-field" dir="ltr" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">رقم الفاتورة</label><input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} className="input-field" dir="ltr" /></div>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">وصف</label><textarea value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} className="input-field resize-none" rows={2} /></div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInvoiceForm(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleCreateInvoice} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الفاتورة'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Member Form Modal */}
      {showMemberForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold">إضافة عضو للعهدة</h3><button onClick={() => setShowMemberForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
            <div><label className="block text-xs text-gray-400 mb-1">المستخدم *</label>
              <select value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })} className="input-field">
                <option value="">— اختر —</option>
                {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr || u.name} ({u.email})</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">نوع العلاقة</label>
              <select value={memberForm.roleType} onChange={(e) => setMemberForm({ ...memberForm, roleType: e.target.value })} className="input-field">
                <option value="manager">مدير</option>
                <option value="custodian">مسؤول عهدة</option>
                <option value="executor">منفذ</option>
                <option value="viewer">مراقب</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowMemberForm(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleAddMember} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Custody Confirmation */}
      {showCloseDialog && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5" /><h3 className="text-sm font-bold">تأكيد إقفال العهدة</h3></div>
            <p className="text-xs text-gray-300">سيتم إقفال العهدة "<span className="text-white font-medium">{selected.name}</span>" نهائياً. لن يمكن إضافة فواتير أو تعديل البيانات بعد الإقفال.</p>
            <div className="p-3 rounded-xl bg-white/[0.03] text-xs">
              <div className="flex justify-between"><span className="text-gray-400">الرصيد النهائي:</span><span className="text-emerald-400 font-bold">{formatNumber(Math.round(selected.currentBalance))} ريال</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-400">إجمالي المصروف:</span><span className="text-amber-400 font-bold">{formatNumber(Math.round(selected.spentAmount))} ريال</span></div>
              <div className="flex justify-between mt-1"><span className="text-gray-400">عدد الفواتير:</span><span className="text-white">{selected.invoices?.length || 0}</span></div>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">ملاحظات الإقفال</label><textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} className="input-field resize-none" rows={2} placeholder="سبب الإقفال أو ملاحظات..." /></div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCloseDialog(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleClose} disabled={submitting} className="btn-danger disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد الإقفال'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
