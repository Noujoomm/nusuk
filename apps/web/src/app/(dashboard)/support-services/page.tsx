'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wallet, Plus, Trash2, Loader2, X, AlertTriangle, CheckCircle,
  Receipt, ClipboardList,
  RefreshCw, Lock, UserPlus, Shield, TrendingDown,
} from 'lucide-react';
import { supportServicesApi, usersApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────
const STATUS_AR: Record<string, string> = { ACTIVE: 'نشطة', LOW_BALANCE: 'رصيد منخفض', CLOSED: 'مقفلة' };
const STATUS_CLS: Record<string, string> = { ACTIVE: 'bg-emerald-500/20 text-emerald-300', LOW_BALANCE: 'bg-amber-500/20 text-amber-300', CLOSED: 'bg-red-500/20 text-red-300' };
const INVOICE_CLS: Record<string, string> = { UPLOADED: 'bg-blue-500/20 text-blue-300', APPROVED: 'bg-emerald-500/20 text-emerald-300', REJECTED: 'bg-red-500/20 text-red-300' };
const ROLE_AR: Record<string, string> = { owner: 'مالك', contributor: 'مساهم', viewer: 'مراقب' };

type MainTab = 'custodies' | 'requests';

export default function SupportServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'pm';
  const [mainTab, setMainTab] = useState<MainTab>('custodies');

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
      <Shield className="h-12 w-12" /><p className="text-sm">غير مصرح بالوصول</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">خدمات المساندة</h1><p className="text-gray-400 mt-1 text-sm">إدارة العهد والطلبات</p></div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06] w-fit">
        <button onClick={() => setMainTab('custodies')}
          className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
            mainTab === 'custodies' ? 'bg-brand-500/15 text-brand-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
          <Wallet className="w-4 h-4" /> إدارة العهد
        </button>
        <button onClick={() => setMainTab('requests')}
          className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
            mainTab === 'requests' ? 'bg-brand-500/15 text-brand-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
          <ClipboardList className="w-4 h-4" /> الطلبات
        </button>
      </div>

      {mainTab === 'custodies' && <CustodyModule />}
      {mainTab === 'requests' && <RequestsModule />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CUSTODY MODULE (إدارة العهد)
// ═══════════════════════════════════════════════════════════

function CustodyModule() {
  const [custodies, setCustodies] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([supportServicesApi.listCustodies(), usersApi.list({ pageSize: 200 })]);
      setCustodies(c.data.data || []);
      setAllUsers(u.data.data || u.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (id: string) => {
    try { const { data } = await supportServicesApi.getCustody(id); setSelected(data); } catch { toast.error('فشل تحميل العهدة'); }
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  // ── Detail View ──
  if (selected) return (
    <CustodyDetail custody={selected} allUsers={allUsers} onBack={() => { setSelected(null); load(); }} onRefresh={() => openDetail(selected.id)} onReload={load} />
  );

  // ── List View ──
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-400">{custodies.length} عهدة</p>
        <div className="flex gap-2">
          <button onClick={() => setShowCreateForm(!showCreateForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> عهدة جديدة</button>
          <button onClick={load} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ── Create Form ── */}
      {showCreateForm && <CreateCustodyForm allUsers={allUsers} onSuccess={() => { setShowCreateForm(false); load(); }} onCancel={() => setShowCreateForm(false)} />}

      {/* ── Cards Grid ── */}
      {custodies.length === 0 ? (
        <div className="glass p-16 text-center"><Wallet className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">لا توجد عهد — أنشئ عهدة جديدة</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {custodies.map((c: any) => {
            const pct = c.initialBalance ? Math.round(((c.spentAmount || 0) / (c.initialBalance || 1)) * 100) : 0;
            const remaining = (c.currentBalance ?? c.remainingAmount ?? 0);
            const isLow = c.status === 'LOW_BALANCE';
            return (
              <div key={c.id} onClick={() => openDetail(c.id)}
                className={cn('glass p-5 cursor-pointer hover:bg-white/[0.06] transition-all', isLow && 'border-amber-500/30')}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">{c.name}</h3>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full', STATUS_CLS[c.status] || 'bg-gray-500/20 text-gray-300')}>{STATUS_AR[c.status] || c.status}</span>
                </div>
                {/* Low Balance Alert */}
                {isLow && (
                  <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <p className="text-[10px] text-amber-300">تنبيه: رصيد العهدة اقترب من النفاد (أقل من 20%)</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                    <p className="text-sm font-bold tabular-nums">{formatNumber(Math.round(c.initialBalance || c.totalAmount || 0))}</p>
                    <p className="text-[9px] text-gray-500">الرصيد</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                    <p className="text-sm font-bold tabular-nums text-amber-400">{formatNumber(Math.round(c.spentAmount || 0))}</p>
                    <p className="text-[9px] text-gray-500">المصروف</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                    <p className="text-sm font-bold tabular-nums text-emerald-400">{formatNumber(Math.round(remaining))}</p>
                    <p className="text-[9px] text-gray-500">المتبقي</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e' }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                  <span>المسؤول: {c.assignedTo?.nameAr || '—'}</span>
                  <span>{c._count?.invoices || 0} فاتورة · {c._count?.members || 0} عضو</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Create Custody Form ──────────────────────────────────
function CreateCustodyForm({ allUsers, onSuccess, onCancel }: { allUsers: any[]; onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', initialBalance: '', balanceAddedAt: '', assignedToId: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.initialBalance || !form.balanceAddedAt) { toast.error('الاسم والرصيد والتاريخ مطلوبة'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.createCustody({ ...form, initialBalance: parseFloat(form.initialBalance), assignedToId: form.assignedToId || undefined });
      toast.success('تم إنشاء العهدة');
      onSuccess();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  return (
    <div className="glass p-5 space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold">إنشاء عهدة جديدة</h3><button onClick={onCancel}><X className="w-4 h-4 text-gray-400" /></button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-400 mb-1">اسم العهدة *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="مثال: عهدة المصروفات" /></div>
        <div><label className="block text-xs text-gray-400 mb-1">الرصيد الأساسي (ريال) *</label><input type="number" min={0} value={form.initialBalance} onChange={(e) => setForm({ ...form, initialBalance: e.target.value })} className="input-field" dir="ltr" /></div>
        <div><label className="block text-xs text-gray-400 mb-1">تاريخ إضافة الرصيد *</label><input type="date" value={form.balanceAddedAt} onChange={(e) => setForm({ ...form, balanceAddedAt: e.target.value })} className="input-field" dir="ltr" /></div>
        <div><label className="block text-xs text-gray-400 mb-1">مسؤول العهدة</label>
          <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className="input-field">
            <option value="">— اختر —</option>
            {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr || u.name}</option>)}
          </select>
        </div>
      </div>
      <div><label className="block text-xs text-gray-400 mb-1">ملاحظات</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field resize-none" rows={2} /></div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">إلغاء</button>
        <button onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء العهدة'}</button>
      </div>
    </div>
  );
}

// ─── Custody Detail View ──────────────────────────────────
function CustodyDetail({ custody: c, allUsers, onBack, onRefresh, onReload }: {
  custody: any; allUsers: any[]; onBack: () => void; onRefresh: () => void; onReload: () => void;
}) {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ name: '', amount: '', invoiceDate: '', invoiceNumber: '', description: '' });
  const [memberForm, setMemberForm] = useState({ userId: '', roleType: 'contributor' });
  const [closeNotes, setCloseNotes] = useState('');

  const isClosed = c.status === 'CLOSED';
  const remaining = c.currentBalance ?? c.remainingAmount ?? 0;
  const initial = c.initialBalance ?? c.totalAmount ?? 1;
  const pct = initial > 0 ? Math.round(((c.spentAmount || 0) / initial) * 100) : 0;

  const handleAddInvoice = async () => {
    if (!invoiceForm.name || !invoiceForm.amount) { toast.error('اسم الفاتورة والمبلغ مطلوبان'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.createInvoice({ custodyId: c.id, ...invoiceForm, amount: parseFloat(invoiceForm.amount), invoiceDate: invoiceForm.invoiceDate || new Date().toISOString() });
      toast.success('تم إضافة الفاتورة');
      setInvoiceForm({ name: '', amount: '', invoiceDate: '', invoiceNumber: '', description: '' });
      setShowInvoiceForm(false);
      onRefresh(); onReload();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleAddMember = async () => {
    if (!memberForm.userId) { toast.error('اختر المستخدم'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.addMember({ custodyId: c.id, ...memberForm });
      toast.success('تم إضافة العضو');
      setMemberForm({ userId: '', roleType: 'contributor' });
      setShowMemberForm(false);
      onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleClose = async () => {
    setSubmitting(true);
    try {
      await supportServicesApi.closeCustody(c.id, { closingNotes: closeNotes });
      toast.success('تم إقفال العهدة');
      setShowCloseDialog(false);
      onBack();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-secondary text-sm">← العودة</button>

      {/* Header Card */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold">{c.name}</h2>
            {c.code && <span className="text-[10px] text-gray-500 tabular-nums">{c.code}</span>}
          </div>
          <div className="flex items-center gap-2">
            {c.assignedTo && <span className="text-xs text-gray-400">المسؤول: <span className="text-white">{c.assignedTo.nameAr}</span></span>}
            <span className={cn('text-xs px-3 py-1 rounded-full', STATUS_CLS[c.status])}>{STATUS_AR[c.status]}</span>
          </div>
        </div>

        {/* Low Balance Alert */}
        {c.status === 'LOW_BALANCE' && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">تنبيه: رصيد العهدة اقترب من النفاد (أقل من 20%)</p>
          </div>
        )}

        {/* Closed Banner */}
        {isClosed && c.closedBy && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            مقفلة بتاريخ {new Date(c.closedAt).toLocaleDateString('ar-SA-u-nu-latn')} بواسطة {c.closedBy.nameAr}
            {c.closingNotes && <span className="block mt-1 text-gray-400">{c.closingNotes}</span>}
          </div>
        )}

        {/* Financial Summary */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center p-3 rounded-xl bg-white/[0.03]"><p className="text-lg font-bold tabular-nums">{formatNumber(Math.round(initial))}</p><p className="text-[10px] text-gray-500">الرصيد الأساسي</p></div>
          <div className="text-center p-3 rounded-xl bg-white/[0.03]"><p className="text-lg font-bold tabular-nums text-amber-400">{formatNumber(Math.round(c.spentAmount || 0))}</p><p className="text-[10px] text-gray-500">المصروف</p></div>
          <div className="text-center p-3 rounded-xl bg-white/[0.03]"><p className="text-lg font-bold tabular-nums text-emerald-400">{formatNumber(Math.round(remaining))}</p><p className="text-[10px] text-gray-500">المتبقي</p></div>
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>المصروف: {pct}%</span><span>المتبقي: {100 - pct}%</span></div>
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e' }} />
          </div>
        </div>

        {/* Actions */}
        {!isClosed && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowInvoiceForm(true)} className="btn-primary text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4" /> إضافة فاتورة</button>
            <button onClick={() => setShowMemberForm(true)} className="btn-secondary text-sm flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> إضافة مسؤول</button>
            <button onClick={() => setShowCloseDialog(true)} className="btn-danger text-sm flex items-center gap-1.5"><Lock className="w-4 h-4" /> إقفال العهدة</button>
          </div>
        )}
      </div>

      {/* ── Add Invoice Form ── */}
      {showInvoiceForm && (
        <div className="glass p-5 space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">إضافة فاتورة</h3><button onClick={() => setShowInvoiceForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
          <p className="text-xs text-gray-400">المتبقي: <span className="text-emerald-400 font-bold">{formatNumber(Math.round(remaining))} ريال</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">اسم الفاتورة *</label><input value={invoiceForm.name} onChange={(e) => setInvoiceForm({ ...invoiceForm, name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">المبلغ (ريال) *</label><input type="number" min={0} value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">التاريخ</label><input type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">رقم الفاتورة</label><input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} className="input-field" dir="ltr" /></div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">وصف</label><textarea value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} className="input-field resize-none" rows={2} /></div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowInvoiceForm(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleAddInvoice} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الفاتورة'}</button>
          </div>
        </div>
      )}

      {/* ── Invoices List ── */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">الفواتير ({c.invoices?.length || 0})</h3>
        {c.invoices?.length > 0 ? (
          <div className="space-y-2">
            {c.invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <div className="flex items-center gap-2"><p className="text-sm font-medium">{inv.name}</p>{inv.invoiceNumber && <span className="text-[10px] text-gray-500">#{inv.invoiceNumber}</span>}</div>
                  <p className="text-[10px] text-gray-500">{inv.createdBy?.nameAr} — {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', INVOICE_CLS[inv.status])}>{inv.status === 'UPLOADED' ? 'مرفوعة' : inv.status === 'APPROVED' ? 'معتمدة' : 'مرفوضة'}</span>
                  <span className="text-sm font-bold tabular-nums text-amber-400">{formatNumber(Math.round(inv.amount))} ريال</span>
                  {!isClosed && inv.status === 'UPLOADED' && (
                    <div className="flex gap-1">
                      <button onClick={async () => { await supportServicesApi.updateInvoiceStatus(inv.id, 'APPROVED'); toast.success('تم الاعتماد'); onRefresh(); onReload(); }} className="p-1 rounded-lg hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-300" title="اعتماد"><CheckCircle className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { await supportServicesApi.deleteInvoice(inv.id); toast.success('تم الحذف'); onRefresh(); onReload(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500 text-center py-6">لا توجد فواتير</p>}
      </div>

      {/* ── Members ── */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">المسؤولون ({c.members?.length || 0})</h3>
        {showMemberForm && (
          <div className="mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })} className="input-field text-sm">
                <option value="">— اختر مستخدم —</option>
                {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr || u.name} ({u.email})</option>)}
              </select>
              <select value={memberForm.roleType} onChange={(e) => setMemberForm({ ...memberForm, roleType: e.target.value })} className="input-field text-sm">
                <option value="owner">مالك</option>
                <option value="contributor">مساهم</option>
                <option value="viewer">مراقب</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowMemberForm(false)} className="text-xs text-gray-400">إلغاء</button>
              <button onClick={handleAddMember} disabled={submitting} className="btn-primary text-xs disabled:opacity-50">{submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'إضافة'}</button>
            </div>
          </div>
        )}
        {c.members?.length > 0 ? (
          <div className="space-y-2">
            {c.members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-300">{m.user?.nameAr?.charAt(0) || '?'}</div>
                  <div><p className="text-sm font-medium">{m.user?.nameAr || m.user?.name}</p><p className="text-[10px] text-gray-500">{m.user?.email}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300">{ROLE_AR[m.roleType] || m.roleType}</span>
                  {!isClosed && <button onClick={async () => { await supportServicesApi.removeMember(c.id, m.id); toast.success('تم الإزالة'); onRefresh(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500 text-center py-4">لم يتم تعيين مسؤولين</p>}
      </div>

      {/* ── Close Custody Dialog ── */}
      {showCloseDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5" /><h3 className="text-sm font-bold">تأكيد إقفال العهدة</h3></div>
            <p className="text-xs text-gray-300">سيتم إقفال العهدة "<span className="text-white font-medium">{c.name}</span>" نهائياً. لن يمكن إضافة فواتير أو تعديل البيانات بعد الإقفال.</p>
            <div className="p-3 rounded-xl bg-white/[0.03] text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-400">الرصيد النهائي:</span><span className="text-emerald-400 font-bold">{formatNumber(Math.round(remaining))} ريال</span></div>
              <div className="flex justify-between"><span className="text-gray-400">المصروف:</span><span className="text-amber-400 font-bold">{formatNumber(Math.round(c.spentAmount || 0))} ريال</span></div>
              <div className="flex justify-between"><span className="text-gray-400">الفواتير:</span><span>{c.invoices?.length || 0}</span></div>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">ملاحظات الإقفال</label><textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} className="input-field resize-none" rows={2} placeholder="سبب الإقفال..." /></div>
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

// ═══════════════════════════════════════════════════════════
//  REQUESTS MODULE (الطلبات)
// ═══════════════════════════════════════════════════════════

function RequestsModule() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ title: '', description: '', responsibleName: '', priority: 'non_urgent' });

  const load = useCallback(async () => {
    try { const { data } = await supportServicesApi.listRequests(filter ? { priority: filter } : {}); setRequests(data || []); }
    catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.title) { toast.error('عنوان الطلب مطلوب'); return; }
    setSubmitting(true);
    try {
      await supportServicesApi.createRequest(form);
      toast.success('تم إضافة الطلب');
      setForm({ title: '', description: '', responsibleName: '', priority: 'non_urgent' });
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {[{ v: '', l: 'الكل' }, { v: 'urgent', l: 'عاجل' }, { v: 'non_urgent', l: 'غير عاجل' }].map((f) => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-medium transition-colors', filter === f.v ? 'bg-brand-500/15 text-brand-400' : 'bg-white/5 text-gray-400 hover:bg-white/10')}>
              {f.l}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> طلب جديد</button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="glass p-5 space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">إضافة طلب جديد</h3><button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">العنوان *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">المسؤول</label><input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} className="input-field" placeholder="اسم المسؤول" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">الأولوية</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input-field">
                <option value="non_urgent">غير عاجل</option>
                <option value="urgent">عاجل</option>
              </select>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">الوصف</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" placeholder="وصف مختصر..." /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button>
            <button onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</button>
          </div>
        </div>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="glass p-16 text-center"><ClipboardList className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">لا توجد طلبات</p></div>
      ) : (
        <div className="space-y-2">
          {requests.map((r: any) => (
            <div key={r.id} className="glass p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{r.title}</span>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', r.priority === 'urgent' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-300')}>
                    {r.priority === 'urgent' ? 'عاجل' : 'غير عاجل'}
                  </span>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full',
                    r.status === 'open' ? 'bg-blue-500/20 text-blue-300' :
                    r.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-amber-500/20 text-amber-300')}>
                    {r.status === 'open' ? 'مفتوح' : r.status === 'completed' ? 'مكتمل' : 'قيد التنفيذ'}
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] text-gray-400">
                  {r.responsibleName && <span>المسؤول: {r.responsibleName}</span>}
                  <span>{r.createdBy?.nameAr}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</span>
                </div>
                {r.description && <p className="text-xs text-gray-400 mt-1">{r.description}</p>}
              </div>
              <div className="flex gap-1">
                {r.status === 'open' && (
                  <button onClick={async () => { await supportServicesApi.updateRequest(r.id, { status: 'in_progress' }); toast.success('قيد التنفيذ'); load(); }}
                    className="p-1.5 rounded-lg hover:bg-amber-500/20 text-gray-400 hover:text-amber-300" title="بدء التنفيذ"><TrendingDown className="w-3.5 h-3.5" /></button>
                )}
                {r.status !== 'completed' && (
                  <button onClick={async () => { await supportServicesApi.updateRequest(r.id, { status: 'completed' }); toast.success('تم الإتمام'); load(); }}
                    className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-300" title="إتمام"><CheckCircle className="w-3.5 h-3.5" /></button>
                )}
                <button onClick={async () => { await supportServicesApi.deleteRequest(r.id); toast.success('تم الحذف'); load(); }}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
