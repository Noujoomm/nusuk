'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wallet, Plus, Trash2, Loader2, X, AlertTriangle, CheckCircle,
  Receipt, ClipboardList, RefreshCw, Lock, UserPlus, Shield, TrendingDown,
} from 'lucide-react';
import { custodyFundsApi, supportServicesApi, usersApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

type MainTab = 'funds' | 'requests';

export default function SupportServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'pm';
  const [mainTab, setMainTab] = useState<MainTab>('funds');

  if (!isAdmin) return <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400"><Shield className="h-12 w-12" /><p className="text-sm">غير مصرح بالوصول</p></div>;

  return (
    <div className="space-y-6 pb-20" dir="rtl">
      <div><h1 className="text-2xl font-bold">خدمات المساندة</h1><p className="text-gray-400 mt-1 text-sm">إدارة العهد والطلبات</p></div>
      <div className="flex gap-2 p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06] w-fit">
        {([{ k: 'funds', l: 'إدارة العهد', i: Wallet }, { k: 'requests', l: 'الطلبات', i: ClipboardList }] as const).map((t) => (
          <button key={t.k} onClick={() => setMainTab(t.k)}
            className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all', mainTab === t.k ? 'bg-brand-500/15 text-brand-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
            <t.i className="w-4 h-4" />{t.l}
          </button>
        ))}
      </div>
      {mainTab === 'funds' && <FundsModule />}
      {mainTab === 'requests' && <RequestsModule />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FUNDS MODULE
// ═══════════════════════════════════════════════════════════
function FundsModule() {
  const [funds, setFunds] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ custodyName: '', totalAmount: '', date: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, u] = await Promise.all([custodyFundsApi.list(), usersApi.list({ pageSize: 200 })]);
      setFunds(f.data || []); setAllUsers(u.data.data || u.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (id: string) => {
    try { const { data } = await custodyFundsApi.get(id); setSelected(data); } catch { toast.error('فشل'); }
  }, []);

  const handleCreate = async () => {
    if (!createForm.custodyName || !createForm.totalAmount || !createForm.date) { toast.error('جميع الحقول مطلوبة'); return; }
    setSubmitting(true);
    try {
      await custodyFundsApi.create({ custodyName: createForm.custodyName, totalAmount: parseFloat(createForm.totalAmount), date: createForm.date });
      toast.success('تم إنشاء العهدة'); setShowCreate(false); setCreateForm({ custodyName: '', totalAmount: '', date: '' }); load();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (selected) return <FundDetail fund={selected} allUsers={allUsers} onBack={() => { setSelected(null); load(); }} onRefresh={() => openDetail(selected.id)} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between"><p className="text-sm text-gray-400">{funds.length} عهدة</p>
        <div className="flex gap-2"><button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إنشاء عهدة جديدة</button><button onClick={load} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button></div>
      </div>
      {showCreate && (
        <div className="glass p-5 space-y-3">
          <h3 className="text-sm font-bold">إنشاء عهدة جديدة</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">اسم العهدة *</label><input value={createForm.custodyName} onChange={(e) => setCreateForm({ ...createForm, custodyName: e.target.value })} className="input-field" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">المبلغ الإجمالي (ر.س) *</label><input type="number" min={0} value={createForm.totalAmount} onChange={(e) => setCreateForm({ ...createForm, totalAmount: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">التاريخ *</label><input type="date" value={createForm.date} onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })} className="input-field" dir="ltr" /></div>
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setShowCreate(false)} className="btn-secondary">إلغاء</button><button onClick={handleCreate} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء'}</button></div>
        </div>
      )}
      {funds.length === 0 ? <div className="glass p-16 text-center"><Wallet className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">لا توجد عهد — أنشئ عهدة جديدة</p></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funds.map((f: any) => {
            const pct = f.totalAmount > 0 ? Math.round((1 - f.currentBalance / f.totalAmount) * 100) : 0;
            const hasAlert = f.alerts?.length > 0 || (f.currentBalance <= f.totalAmount * 0.2 && f.status !== 'closed');
            return (
              <div key={f.id} onClick={() => openDetail(f.id)} className={cn('glass p-5 cursor-pointer hover:bg-white/[0.06] transition-all', hasAlert && 'border-amber-500/30')}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">{f.custodyName}</h3>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full', f.status === 'closed' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300')}>{f.status === 'closed' ? 'مغلقة' : 'نشطة'}</span>
                </div>
                {hasAlert && f.status !== 'closed' && (
                  <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" /><p className="text-[10px] text-amber-300">تنبيه: رصيد العهدة وصل إلى أقل من ٢٠٪</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-white/[0.03]"><p className="text-sm font-bold tabular-nums">{formatNumber(Math.round(f.totalAmount))}</p><p className="text-[9px] text-gray-500">الإجمالي</p></div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.03]"><p className="text-sm font-bold tabular-nums text-emerald-400">{formatNumber(Math.round(f.currentBalance))}</p><p className="text-[9px] text-gray-500">المتبقي</p></div>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e' }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FUND DETAIL
// ═══════════════════════════════════════════════════════════
function FundDetail({ fund: f, allUsers, onBack, onRefresh }: { fund: any; allUsers: any[]; onBack: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<'ledger' | 'members' | 'invoices'>('ledger');
  const [ledger, setLedger] = useState<any[]>([]);
  const [showTxForm, setShowTxForm] = useState(false);
  const [showInvForm, setShowInvForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txForm, setTxForm] = useState({ transactionType: 'credit', amount: '', transactionDate: '', note: '' });
  const [invForm, setInvForm] = useState({ invoiceName: '', amount: '', invoiceDate: '', custodyMemberId: '', notes: '' });
  const [invFile, setInvFile] = useState<File | null>(null);
  const [memberForm, setMemberForm] = useState({ userId: '', allocatedAmount: '', roleNote: '' });
  const [closeNote, setCloseNote] = useState('');
  const isClosed = f.status === 'closed';
  const pct = f.totalAmount > 0 ? Math.round((1 - f.currentBalance / f.totalAmount) * 100) : 0;

  const loadLedger = useCallback(async () => {
    try { const { data } = await custodyFundsApi.getLedger(f.id); setLedger(data.data || []); } catch {}
  }, [f.id]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const handleTx = async () => {
    if (!txForm.amount || !txForm.transactionDate) { toast.error('المبلغ والتاريخ مطلوبان'); return; }
    setSubmitting(true);
    try { await custodyFundsApi.addTransaction(f.id, { ...txForm, amount: parseFloat(txForm.amount) }); toast.success('تم'); setTxForm({ transactionType: 'credit', amount: '', transactionDate: '', note: '' }); setShowTxForm(false); onRefresh(); loadLedger(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleInv = async () => {
    if (!invForm.invoiceName || !invForm.amount) { toast.error('الاسم والمبلغ مطلوبان'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('invoiceName', invForm.invoiceName); fd.append('amount', invForm.amount);
      fd.append('invoiceDate', invForm.invoiceDate || new Date().toISOString());
      if (invForm.custodyMemberId) fd.append('custodyMemberId', invForm.custodyMemberId);
      if (invForm.notes) fd.append('notes', invForm.notes);
      if (invFile) fd.append('file', invFile);
      await custodyFundsApi.addInvoice(f.id, fd); toast.success('تم تسجيل الفاتورة');
      setInvForm({ invoiceName: '', amount: '', invoiceDate: '', custodyMemberId: '', notes: '' }); setInvFile(null); setShowInvForm(false); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleMember = async () => {
    if (!memberForm.userId || !memberForm.allocatedAmount) { toast.error('المستخدم والمبلغ مطلوبان'); return; }
    setSubmitting(true);
    try { await custodyFundsApi.addMember(f.id, { userId: memberForm.userId, allocatedAmount: parseFloat(memberForm.allocatedAmount), roleNote: memberForm.roleNote || undefined }); toast.success('تم'); setMemberForm({ userId: '', allocatedAmount: '', roleNote: '' }); setShowMemberForm(false); onRefresh(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  const handleClose = async () => {
    setSubmitting(true);
    try { await custodyFundsApi.close(f.id, closeNote); toast.success('تم إقفال العهدة'); setShowClose(false); onBack(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="btn-secondary text-sm">← العودة</button>

      {/* Header */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{f.custodyName}</h2>
          <span className={cn('text-xs px-3 py-1 rounded-full', isClosed ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300')}>{isClosed ? 'مغلقة' : 'نشطة'}</span>
        </div>
        {f.alerts?.length > 0 && !isClosed && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: '#FAEEDA', color: '#633806' }}>
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><p className="text-xs font-medium">تنبيه: رصيد العهدة وصل إلى أقل من ٢٠٪ — يرجى اتخاذ الإجراء اللازم</p></div>
          </div>
        )}
        {isClosed && f.closedBy && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            <div className="flex items-center justify-between">
              <div>
                مغلقة بتاريخ {new Date(f.closedAt).toLocaleDateString('ar-SA-u-nu-latn')} بواسطة {f.closedBy.nameAr}
                {f.closingNote && <span className="block mt-1 text-gray-400">{f.closingNote}</span>}
              </div>
              <button onClick={async () => {
                const reason = prompt('سبب إعادة فتح العهدة:');
                if (!reason || reason.trim().length < 3) { toast.error('يجب إدخال سبب (٣ أحرف على الأقل)'); return; }
                try { await custodyFundsApi.reopen(f.id, reason); toast.success('تم إعادة فتح العهدة'); onBack(); }
                catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); }
              }} className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-medium hover:bg-emerald-500/30 shrink-0">
                إعادة فتح
              </button>
            </div>
          </div>
        )}
        {/* Balance Card */}
        <div className="text-center p-6 rounded-2xl bg-white/[0.03] mb-3">
          <p className="text-4xl font-bold tabular-nums text-white">{formatNumber(Math.round(f.currentBalance))}</p>
          <p className="text-sm text-gray-400 mt-1">الرصيد الحالي (ر.س)</p>
          <p className="text-xs text-gray-500 mt-0.5">من أصل {formatNumber(Math.round(f.totalAmount))} ر.س</p>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e' }} />
        </div>
        {!isClosed && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowTxForm(true)} className="btn-primary text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> إضافة معاملة</button>
            <button onClick={() => setShowInvForm(true)} className="btn-secondary text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4" /> تسجيل فاتورة</button>
            <button onClick={() => setShowMemberForm(true)} className="btn-secondary text-sm flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> إضافة شخص</button>
            <button onClick={() => setShowClose(true)} className="btn-danger text-sm flex items-center gap-1.5"><Lock className="w-4 h-4" /> إقفال العهدة</button>
          </div>
        )}
      </div>

      {/* Transaction Form */}
      {showTxForm && (
        <div className="glass p-5 space-y-3">
          <h3 className="text-sm font-bold">إضافة معاملة</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">النوع</label>
              <div className="flex gap-2">{[{ v: 'credit', l: 'إضافة', c: 'bg-emerald-500/20 text-emerald-300' }, { v: 'debit', l: 'خصم', c: 'bg-red-500/20 text-red-300' }].map((t) => (
                <button key={t.v} onClick={() => setTxForm({ ...txForm, transactionType: t.v })} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', txForm.transactionType === t.v ? t.c : 'bg-white/5 text-gray-400')}>{t.l}</button>
              ))}</div>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">المبلغ (ر.س) *</label><input type="number" min={0} value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">التاريخ *</label><input type="date" value={txForm.transactionDate} onChange={(e) => setTxForm({ ...txForm, transactionDate: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">ملاحظة</label><input value={txForm.note} onChange={(e) => setTxForm({ ...txForm, note: e.target.value })} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setShowTxForm(false)} className="btn-secondary">إلغاء</button><button onClick={handleTx} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</button></div>
        </div>
      )}

      {/* Invoice Form */}
      {showInvForm && (
        <div className="glass p-5 space-y-3">
          <h3 className="text-sm font-bold">تسجيل فاتورة</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">اسم الفاتورة *</label><input value={invForm.invoiceName} onChange={(e) => setInvForm({ ...invForm, invoiceName: e.target.value })} className="input-field" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">المبلغ (ر.س) *</label><input type="number" min={0} value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">التاريخ</label><input type="date" value={invForm.invoiceDate} onChange={(e) => setInvForm({ ...invForm, invoiceDate: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">المسؤول</label>
              <select value={invForm.custodyMemberId} onChange={(e) => setInvForm({ ...invForm, custodyMemberId: e.target.value })} className="input-field">
                <option value="">— عام —</option>
                {f.members?.map((m: any) => <option key={m.id} value={m.id}>{m.user?.nameAr || m.user?.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">ارفاق ملف (PDF, صورة)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setInvFile(e.target.files?.[0] || null)} className="input-field text-sm" />
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">ملاحظات</label><textarea value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} className="input-field resize-none" rows={2} /></div>
          <div className="flex justify-end gap-2"><button onClick={() => setShowInvForm(false)} className="btn-secondary">إلغاء</button><button onClick={handleInv} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الفاتورة'}</button></div>
        </div>
      )}

      {/* Member Form */}
      {showMemberForm && (
        <div className="glass p-5 space-y-3">
          <h3 className="text-sm font-bold">إضافة شخص</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">المستخدم *</label>
              <select value={memberForm.userId} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })} className="input-field">
                <option value="">— اختر —</option>{allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.nameAr || u.name}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">المبلغ المخصص (ر.س) *</label><input type="number" min={0} value={memberForm.allocatedAmount} onChange={(e) => setMemberForm({ ...memberForm, allocatedAmount: e.target.value })} className="input-field" dir="ltr" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">الدور</label><input value={memberForm.roleNote} onChange={(e) => setMemberForm({ ...memberForm, roleNote: e.target.value })} className="input-field" placeholder="مثال: مسؤول الصرف" /></div>
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setShowMemberForm(false)} className="btn-secondary">إلغاء</button><button onClick={handleMember} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}</button></div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([{ k: 'ledger', l: 'السجل المالي' }, { k: 'members', l: `الأشخاص (${f.members?.length || 0})` }, { k: 'invoices', l: `الفواتير (${f.invoices?.length || 0})` }] as const).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cn('px-4 py-2 rounded-xl text-xs font-medium', tab === t.k ? 'bg-brand-500/15 text-brand-400' : 'bg-white/5 text-gray-400')}>{t.l}</button>
        ))}
      </div>

      {/* Ledger Tab */}
      {tab === 'ledger' && (
        <div className="glass p-5 overflow-x-auto">
          {ledger.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">لا توجد معاملات</p> : (
            <table className="w-full text-sm"><thead><tr className="border-b border-white/10">{['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'بواسطة'].map((h) => <th key={h} className="py-2 px-2 text-gray-400 font-medium text-right text-xs">{h}</th>)}</tr></thead>
              <tbody>{ledger.map((tx: any) => (
                <tr key={tx.id} className="border-b border-white/5">
                  <td className="py-2 px-2 text-xs tabular-nums text-gray-300">{new Date(tx.transactionDate).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</td>
                  <td className="py-2 px-2"><span className={cn('text-[10px] px-2 py-0.5 rounded-full', tx.transactionType === 'credit' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>{tx.transactionType === 'credit' ? 'إضافة' : 'خصم'}</span></td>
                  <td className={cn('py-2 px-2 text-xs tabular-nums font-medium', tx.transactionType === 'credit' ? 'text-emerald-400' : 'text-red-400')}>{tx.transactionType === 'credit' ? '+' : '-'}{formatNumber(Math.round(tx.amount))}</td>
                  <td className="py-2 px-2 text-xs text-gray-400">{tx.note || '—'}</td>
                  <td className="py-2 px-2 text-xs text-gray-400">{tx.createdBy?.nameAr || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Members Tab */}
      {tab === 'members' && (
        <div className="glass p-5">
          {f.members?.length > 0 ? (
            <div className="space-y-2">{f.members.map((m: any) => {
              const remaining = m.allocatedAmount - m.spentAmount;
              const mPct = m.allocatedAmount > 0 ? Math.round((m.spentAmount / m.allocatedAmount) * 100) : 0;
              const isLow = remaining < m.allocatedAmount * 0.1;
              return (
                <div key={m.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-300">{m.user?.nameAr?.charAt(0) || '?'}</div>
                      <div><p className="text-sm font-medium">{m.user?.nameAr || m.user?.name}</p>{m.roleNote && <p className="text-[10px] text-gray-500">{m.roleNote}</p>}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLow && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">رصيد منخفض</span>}
                      {!isClosed && <button onClick={async () => { await custodyFundsApi.removeMember(f.id, m.id); toast.success('تم'); onRefresh(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div><p className="text-xs font-bold tabular-nums">{formatNumber(Math.round(m.allocatedAmount))}</p><p className="text-gray-500">المخصص</p></div>
                    <div><p className="text-xs font-bold tabular-nums text-amber-400">{formatNumber(Math.round(m.spentAmount))}</p><p className="text-gray-500">المصروف</p></div>
                    <div><p className="text-xs font-bold tabular-nums text-emerald-400">{formatNumber(Math.round(remaining))}</p><p className="text-gray-500">المتبقي</p></div>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, mPct)}%`, background: mPct >= 90 ? '#ef4444' : mPct >= 70 ? '#f59e0b' : '#22c55e' }} /></div>
                </div>
              );
            })}</div>
          ) : <p className="text-sm text-gray-500 text-center py-8">لم يتم تعيين أشخاص</p>}
        </div>
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <div className="glass p-5">
          {f.invoices?.length > 0 ? (
            <>
              <div className="flex justify-between text-xs text-gray-400 mb-3 p-2 rounded-lg bg-white/[0.03]">
                <span>إجمالي الفواتير: {formatNumber(Math.round(f.invoices.reduce((s: number, i: any) => s + i.amount, 0)))} ر.س</span>
                <span>معتمدة: {formatNumber(Math.round(f.invoices.filter((i: any) => i.status === 'approved').reduce((s: number, i: any) => s + i.amount, 0)))} ر.س</span>
              </div>
              <div className="space-y-2">{f.invoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div>
                    <p className="text-sm font-medium">{inv.invoiceName}</p>
                    <div className="flex gap-3 text-[10px] text-gray-500 mt-0.5">
                      <span>{inv.createdBy?.nameAr}</span>
                      <span>{new Date(inv.invoiceDate).toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' })}</span>
                      {inv.custodyMember && <span>→ {inv.custodyMember.user?.nameAr}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {inv.attachmentOriginalName && <a href={`/api/custody-funds/invoices/${inv.id}/download`} target="_blank" rel="noopener" className="text-[10px] text-sky-400 hover:underline">📎 {inv.attachmentOriginalName}</a>}
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full',
                      inv.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : inv.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300')}>
                      {inv.status === 'approved' ? 'مقبولة' : inv.status === 'rejected' ? 'مرفوضة' : 'قيد المراجعة'}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-amber-400">{formatNumber(Math.round(inv.amount))} ر.س</span>
                    {!isClosed && inv.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={async () => { await custodyFundsApi.updateInvoiceStatus(inv.id, 'approved'); toast.success('تم الاعتماد'); onRefresh(); }} className="p-1 rounded-lg hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-300"><CheckCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={async () => { await custodyFundsApi.updateInvoiceStatus(inv.id, 'rejected'); toast.success('تم الرفض'); onRefresh(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300" title="رفض"><X className="w-3.5 h-3.5" /></button>
                        <button onClick={async () => { if (!confirm('حذف هذه الفاتورة؟')) return; await custodyFundsApi.deleteInvoice(inv.id); toast.success('تم الحذف'); onRefresh(); }} className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300" title="حذف"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}</div>
            </>
          ) : <p className="text-sm text-gray-500 text-center py-8">لا توجد فواتير</p>}
        </div>
      )}

      {/* Close Dialog */}
      {showClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5" /><h3 className="text-sm font-bold">هل أنت متأكد من إقفال هذه العهدة؟</h3></div>
            <p className="text-xs text-gray-300">لن تتمكن من إضافة معاملات جديدة بعد الإقفال.</p>
            <div className="p-3 rounded-xl bg-white/[0.03] text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-400">الرصيد النهائي:</span><span className="text-emerald-400 font-bold">{formatNumber(Math.round(f.currentBalance))} ر.س</span></div>
              <div className="flex justify-between"><span className="text-gray-400">الفواتير:</span><span>{f._count?.invoices || 0}</span></div>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">ملاحظة الإقفال</label><textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} className="input-field resize-none" rows={2} /></div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClose(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleClose} disabled={submitting} className="btn-danger disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد الإقفال'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REQUESTS MODULE
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
    try { await supportServicesApi.createRequest(form); toast.success('تم'); setForm({ title: '', description: '', responsibleName: '', priority: 'non_urgent' }); setShowForm(false); load(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'فشل'); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">{[{ v: '', l: 'الكل' }, { v: 'urgent', l: 'عاجل' }, { v: 'non_urgent', l: 'غير عاجل' }].map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)} className={cn('px-3 py-1.5 rounded-xl text-xs font-medium', filter === f.v ? 'bg-brand-500/15 text-brand-400' : 'bg-white/5 text-gray-400')}>{f.l}</button>
        ))}</div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> إضافة طلب</button>
      </div>
      {showForm && (
        <div className="glass p-5 space-y-3">
          <h3 className="text-sm font-bold">إضافة طلب جديد</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">عنوان الطلب *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">مسؤول الطلب</label><input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">الأولوية</label>
              <div className="flex gap-2">{[{ v: 'urgent', l: 'عاجل', c: 'bg-red-500/20 text-red-300' }, { v: 'non_urgent', l: 'غير عاجل', c: 'bg-gray-500/20 text-gray-300' }].map((p) => (
                <button key={p.v} onClick={() => setForm({ ...form, priority: p.v })} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', form.priority === p.v ? p.c : 'bg-white/5 text-gray-400')}>{p.l}</button>
              ))}</div>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">الوصف</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" /></div>
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="btn-secondary">إلغاء</button><button onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</button></div>
        </div>
      )}
      {requests.length === 0 ? (
        <div className="glass p-16 text-center"><ClipboardList className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">لا توجد طلبات حتى الآن — اضغط على إضافة طلب للبدء</p></div>
      ) : (
        <div className="space-y-2">{requests.map((r: any) => (
          <div key={r.id} className="glass p-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{r.title}</span>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', r.priority === 'urgent' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-300')}>{r.priority === 'urgent' ? 'عاجل' : 'غير عاجل'}</span>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', r.status === 'open' ? 'bg-blue-500/20 text-blue-300' : r.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : r.status === 'in_progress' ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-500/20 text-gray-300')}>
                  {r.status === 'open' ? 'مفتوح' : r.status === 'completed' ? 'منجز' : r.status === 'in_progress' ? 'قيد التنفيذ' : 'ملغى'}
                </span>
              </div>
              <div className="flex gap-4 text-[10px] text-gray-400">
                {r.responsibleName && <span>المسؤول: {r.responsibleName}</span>}
                <span>{r.createdBy?.nameAr}</span>
              </div>
            </div>
            <div className="flex gap-1">
              {r.status === 'open' && <button onClick={async () => { await supportServicesApi.updateRequest(r.id, { status: 'in_progress' }); load(); }} className="p-1.5 rounded-lg hover:bg-amber-500/20 text-gray-400 hover:text-amber-300" title="بدء التنفيذ"><TrendingDown className="w-3.5 h-3.5" /></button>}
              {r.status !== 'completed' && r.status !== 'cancelled' && <button onClick={async () => { await supportServicesApi.updateRequest(r.id, { status: 'completed' }); load(); }} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-300" title="إتمام"><CheckCircle className="w-3.5 h-3.5" /></button>}
              <button onClick={async () => { await supportServicesApi.deleteRequest(r.id); toast.success('تم'); load(); }} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  );
}
