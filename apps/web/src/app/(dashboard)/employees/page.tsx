'use client';

import { useEffect, useState, useCallback } from 'react';
import { employeesApi, tracksApi } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import {
  Users,
  Search,
  Briefcase,
  Building,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Calendar,
  AlertTriangle,
  LayoutGrid,
  List,
  Clock,
  Undo2,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import CrudModal, { FieldDef } from '@/components/crud-modal';
import ConfirmDialog from '@/components/confirm-dialog';

interface Track {
  id: string;
  name: string;
  nameAr: string;
  color: string;
}

interface Employee {
  id: string;
  fullNameAr: string;
  fullName: string;
  positionAr: string;
  position: string;
  contractType: string | null;
  track: Track;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  status?: string | null;
  hireDate?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  nationalId?: string | null;
  notes?: string | null;
}

const CONTRACT_TYPES = [
  { value: 'دوام كامل', label: 'دوام كامل' },
  { value: 'دوام جزئي', label: 'دوام جزئي' },
  { value: 'عقد مؤقت', label: 'عقد مؤقت' },
  { value: 'استشاري', label: 'استشاري' },
  { value: 'متعاون', label: 'متعاون' },
  { value: 'تدريب', label: 'تدريب' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'نشط', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  inactive: { label: 'غير نشط', color: 'text-gray-400', bg: 'bg-gray-500/20' },
  on_leave: { label: 'في إجازة', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  terminated: { label: 'منتهي', color: 'text-red-400', bg: 'bg-red-500/20' },
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'نشط' },
  { value: 'inactive', label: 'غير نشط' },
  { value: 'on_leave', label: 'في إجازة' },
  { value: 'terminated', label: 'منتهي' },
];

function isContractExpiringSoon(contractEndDate: string | null | undefined): boolean {
  if (!contractEndDate) return false;
  const end = new Date(contractEndDate);
  const now = new Date();
  const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 0 && diffDays <= 30;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; undoId?: string; undoIds?: string[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'hr';

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map((e) => e.id)));
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success', undoId?: string, undoIds?: string[]) => {
    setToast({ message, type, undoId, undoIds });
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  };

  const handleUndo = async () => {
    if (!toast) return;
    try {
      if (toast.undoIds && toast.undoIds.length > 0) {
        await Promise.all(toast.undoIds.map((id) => employeesApi.restore(id)));
      } else if (toast.undoId) {
        await employeesApi.restore(toast.undoId);
      }
      setToast(null);
      await refreshList();
      showToast('تم استعادة البيانات بنجاح');
    } catch {
      showToast('فشل في استعادة البيانات', 'error');
    }
  };

  const fetchEmployees = useCallback(async (params?: any) => {
    try {
      const { data } = await employeesApi.list(params);
      setEmployees(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [empRes, trackRes] = await Promise.all([
          employeesApi.list({}),
          tracksApi.list(),
        ]);
        setEmployees(empRes.data);
        setTracks(trackRes.data);
      } catch {
        // silent
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    const timeout = setTimeout(() => {
      fetchEmployees({
        trackId: trackFilter || undefined,
        search: search || undefined,
        status: statusFilter || undefined,
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, trackFilter, statusFilter, loading, fetchEmployees]);

  const refreshList = useCallback(async () => {
    await fetchEmployees({ trackId: trackFilter || undefined, search: search || undefined, status: statusFilter || undefined });
  }, [fetchEmployees, trackFilter, search, statusFilter]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      await employeesApi.bulkDelete(ids);
      setSelectedIds(new Set());
      await refreshList();
      showToast(`تم حذف ${ids.length} موظف`, 'success', undefined, ids);
    } catch {
      showToast('حدث خطأ أثناء الحذف الجماعي', 'error');
    }
    setBulkDeleting(false);
  };

  const handleSubmit = async (data: any) => {
    try {
      if (editingEmployee) {
        await employeesApi.update(editingEmployee.id, data);
        showToast('تم تحديث بيانات الموظف بنجاح');
      } else {
        await employeesApi.create(data);
        showToast('تم إضافة الموظف بنجاح');
      }
      await fetchEmployees({ trackId: trackFilter || undefined, search: search || undefined, status: statusFilter || undefined });
    } catch {
      showToast('حدث خطأ أثناء الحفظ', 'error');
      throw new Error('Save failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    setDeleting(true);
    try {
      await employeesApi.delete(deletedId);
      await refreshList();
      setDeleteTarget(null);
      showToast('تم حذف الموظف بنجاح', 'success', deletedId);
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
    setDeleting(false);
  };

  const fields: FieldDef[] = [
    { name: 'fullNameAr', label: 'الاسم بالعربي', type: 'text', required: true },
    { name: 'fullName', label: 'الاسم بالإنجليزي', type: 'text', required: true },
    { name: 'positionAr', label: 'المنصب بالعربي', type: 'text' },
    { name: 'position', label: 'المنصب بالإنجليزي', type: 'text' },
    { name: 'trackId', label: 'المسار', type: 'select', options: tracks.map((t) => ({ value: t.id, label: t.nameAr })) },
    { name: 'contractType', label: 'نوع العقد', type: 'select', options: CONTRACT_TYPES },
    { name: 'department', label: 'القسم', type: 'text' },
    { name: 'status', label: 'الحالة', type: 'select', options: STATUS_OPTIONS },
    { name: 'email', label: 'البريد الإلكتروني', type: 'text', placeholder: 'example@email.com' },
    { name: 'phone', label: 'رقم الجوال', type: 'text', placeholder: '05xxxxxxxx' },
    { name: 'nationalId', label: 'رقم الهوية', type: 'text' },
    { name: 'hireDate', label: 'تاريخ التعيين', type: 'date' },
    { name: 'contractStartDate', label: 'بداية العقد', type: 'date' },
    { name: 'contractEndDate', label: 'نهاية العقد', type: 'date' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea' },
  ];

  // Stats
  const totalEmployees = employees.length;
  const activeCount = employees.filter((e) => e.status === 'active' || !e.status).length;
  const onLeaveCount = employees.filter((e) => e.status === 'on_leave').length;
  const expiringCount = employees.filter((e) => isContractExpiringSoon(e.contractEndDate)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast with Undo */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
        }`}>
          <span>{toast.message}</span>
          {(toast.undoId || (toast.undoIds && toast.undoIds.length > 0)) && (
            <button onClick={handleUndo} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors">
              <Undo2 className="w-3 h-3" />
              تراجع
            </button>
          )}
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الموظفون</h1>
          <p className="text-gray-400 mt-1">إدارة بيانات الموظفين والعقود</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center glass rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:text-white'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {canEdit && (
            <button
              onClick={() => { setEditingEmployee(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/20 text-brand-300 text-sm font-medium hover:bg-brand-500/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إضافة موظف
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">{formatNumber(totalEmployees)}</p>
              <p className="text-xs text-gray-400">إجمالي الموظفين</p>
            </div>
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20">
              <UserCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">{formatNumber(activeCount)}</p>
              <p className="text-xs text-gray-400">موظف نشط</p>
            </div>
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">{formatNumber(onLeaveCount)}</p>
              <p className="text-xs text-gray-400">في إجازة</p>
            </div>
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${expiringCount > 0 ? 'bg-red-500/20' : 'bg-violet-500/20'}`}>
              {expiringCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <Calendar className="w-5 h-5 text-violet-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold truncate">{formatNumber(expiringCount)}</p>
              <p className="text-xs text-gray-400">عقد ينتهي قريبًا</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث بالاسم أو المنصب أو البريد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pr-10"
          />
        </div>
        <select
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">كل المسارات</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>{t.nameAr}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">كل الحالات</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Bulk Action Bar */}
      {canEdit && selectedIds.size > 0 && (
        <div className="glass p-3 flex items-center justify-between rounded-xl border border-brand-500/20">
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-300 font-medium">
              تم تحديد {selectedIds.size} موظف
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              إلغاء التحديد
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-300 text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {bulkDeleting ? 'جاري الحذف...' : `حذف المحدد (${selectedIds.size})`}
          </button>
        </div>
      )}

      {/* Employee List */}
      {employees.length === 0 ? (
        <div className="glass p-12 text-center">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">لا يوجد موظفون مطابقون للبحث</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const statusInfo = STATUS_CONFIG[emp.status || 'active'] || STATUS_CONFIG.active;
            const expiring = isContractExpiringSoon(emp.contractEndDate);
            return (
              <div key={emp.id} className="glass glass-hover p-5 flex flex-col group/card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {canEdit && (
                      <button onClick={() => toggleSelect(emp.id)} className="shrink-0 text-gray-400 hover:text-brand-300 transition-colors">
                        {selectedIds.has(emp.id) ? <CheckSquare className="w-4 h-4 text-brand-400" /> : <Square className="w-4 h-4" />}
                      </button>
                    )}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: emp.track?.color ? `${emp.track.color}20` : 'rgba(255,255,255,0.1)' }}
                    >
                      <Briefcase className="w-5 h-5" style={{ color: emp.track?.color || '#9ca3af' }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">{emp.fullNameAr}</h3>
                      <p className="text-xs text-gray-400 truncate">{emp.positionAr || emp.position || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingEmployee(emp); setModalOpen(true); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: emp.track?.color || '#6b7280' }}
                    />
                    <span className="text-sm text-gray-300 truncate">{emp.track?.nameAr || 'بدون مسار'}</span>
                  </div>
                  {emp.contractType && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{emp.contractType}</span>
                    </div>
                  )}
                  {emp.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate" dir="ltr">{emp.email}</span>
                    </div>
                  )}
                  {emp.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate" dir="ltr">{emp.phone}</span>
                    </div>
                  )}
                </div>

                {/* Contract end date */}
                {emp.contractEndDate && (
                  <div className={`mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs ${
                    expiring ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {expiring && <AlertTriangle className="w-3 h-3 shrink-0" />}
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>نهاية العقد: {formatDate(emp.contractEndDate)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {canEdit && (
                    <th className="px-4 py-3 w-10">
                      <button onClick={toggleSelectAll} className="text-gray-400 hover:text-brand-300 transition-colors">
                        {selectedIds.size === employees.length && employees.length > 0
                          ? <CheckSquare className="w-4 h-4 text-brand-400" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                  )}
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">الموظف</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">المنصب</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">المسار</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">نوع العقد</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">البريد</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">الجوال</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">نهاية العقد</th>
                  {canEdit && <th className="text-center px-4 py-3 text-gray-400 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const statusInfo = STATUS_CONFIG[emp.status || 'active'] || STATUS_CONFIG.active;
                  const expiring = isContractExpiringSoon(emp.contractEndDate);
                  return (
                    <tr key={emp.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${selectedIds.has(emp.id) ? 'bg-brand-500/5' : ''}`}>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <button onClick={() => toggleSelect(emp.id)} className="text-gray-400 hover:text-brand-300 transition-colors">
                            {selectedIds.has(emp.id) ? <CheckSquare className="w-4 h-4 text-brand-400" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: emp.track?.color ? `${emp.track.color}20` : 'rgba(255,255,255,0.1)' }}
                          >
                            <Briefcase className="w-4 h-4" style={{ color: emp.track?.color || '#9ca3af' }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{emp.fullNameAr}</p>
                            <p className="text-xs text-gray-500 truncate">{emp.fullName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{emp.positionAr || emp.position || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-gray-300">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: emp.track?.color || '#6b7280' }} />
                          {emp.track?.nameAr || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{emp.contractType || '-'}</td>
                      <td className="px-4 py-3 text-gray-400" dir="ltr">{emp.email || '-'}</td>
                      <td className="px-4 py-3 text-gray-400" dir="ltr">{emp.phone || '-'}</td>
                      <td className="px-4 py-3">
                        {emp.contractEndDate ? (
                          <span className={`flex items-center gap-1 ${expiring ? 'text-red-400' : 'text-gray-400'}`}>
                            {expiring && <AlertTriangle className="w-3 h-3" />}
                            {formatDate(emp.contractEndDate)}
                          </span>
                        ) : '-'}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setEditingEmployee(emp); setModalOpen(true); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(emp)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CrudModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingEmployee(null); }}
        onSubmit={handleSubmit}
        title={editingEmployee ? 'تعديل موظف' : 'إضافة موظف'}
        fields={fields}
        initialData={editingEmployee ? {
          fullNameAr: editingEmployee.fullNameAr,
          fullName: editingEmployee.fullName,
          positionAr: editingEmployee.positionAr,
          position: editingEmployee.position,
          trackId: editingEmployee.track?.id || '',
          contractType: editingEmployee.contractType || '',
          department: editingEmployee.department || '',
          status: editingEmployee.status || 'active',
          email: editingEmployee.email || '',
          phone: editingEmployee.phone || '',
          nationalId: editingEmployee.nationalId || '',
          hireDate: editingEmployee.hireDate || '',
          contractStartDate: editingEmployee.contractStartDate || '',
          contractEndDate: editingEmployee.contractEndDate || '',
          notes: editingEmployee.notes || '',
        } : undefined}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف موظف"
        message={`هل تريد حذف الموظف "${deleteTarget?.fullNameAr}"؟ يمكنك التراجع عن الحذف خلال 5 ثوانٍ.`}
        loading={deleting}
      />
    </div>
  );
}
