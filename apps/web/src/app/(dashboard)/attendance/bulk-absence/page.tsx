'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Save,
  Shield,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/stores/auth';
import { tracksApi, bookletsApi, absencesApi, type AbsenceTypeKey } from '@/lib/api';

interface TrackOption {
  id: string;
  name: string;
  nameAr: string;
}

interface BookletOption {
  id: string;
  code: string;
  nameAr: string;
}

interface EmployeeRow {
  id: string;
  fullName: string;
  fullNameAr: string;
  position: string | null;
  positionAr: string | null;
  email: string | null;
  department: string | null;
  status: string;
  existingAbsence: {
    id: string;
    type: AbsenceTypeKey;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason: string | null;
    hours: string | null;
  } | null;
}

interface RowDraft {
  selected: boolean;
  type: AbsenceTypeKey;
  reason: string;
  hours: string;
}

const ABSENCE_TYPES: Array<{ value: AbsenceTypeKey; label: string }> = [
  { value: 'ABSENT',       label: 'غياب' },
  { value: 'LATE',         label: 'تأخر' },
  { value: 'EARLY_LEAVE',  label: 'انصراف مبكر' },
  { value: 'EXCUSED',      label: 'غياب بعذر' },
  { value: 'SICK_LEAVE',   label: 'إجازة مرضية' },
  { value: 'ANNUAL_LEAVE', label: 'إجازة سنوية' },
];

const ABSENCE_TYPE_LABEL: Record<AbsenceTypeKey, string> = ABSENCE_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {} as Record<AbsenceTypeKey, string>,
);

const ABSENCE_STATUS_LABEL = {
  PENDING: 'بانتظار الاعتماد',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
} as const;

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function BulkAbsencePage() {
  const { user } = useAuth();
  const allowedRoles = ['admin', 'pm', 'hr', 'track_lead'];
  const canRecord = !!user && allowedRoles.includes(user.role);

  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [booklets, setBooklets] = useState<BookletOption[]>([]);
  const [trackId, setTrackId] = useState('');
  const [bookletId, setBookletId] = useState('');
  const [date, setDate] = useState<string>(todayYmd());
  const [globalReason, setGlobalReason] = useState('');

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const [tracksLoading, setTracksLoading] = useState(false);
  const [bookletsLoading, setBookletsLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load tracks
  useEffect(() => {
    if (!canRecord) return;
    setTracksLoading(true);
    tracksApi
      .list()
      .then(({ data }) => setTracks(data))
      .catch(() => toast.error('فشل تحميل المسارات'))
      .finally(() => setTracksLoading(false));
  }, [canRecord]);

  // Load booklets when track changes
  useEffect(() => {
    setBookletId('');
    setBooklets([]);
    setEmployees([]);
    setDrafts({});
    if (!trackId) return;
    setBookletsLoading(true);
    bookletsApi
      .listByTrack(trackId)
      .then(({ data }) => setBooklets(data))
      .catch(() => toast.error('فشل تحميل الكراسات'))
      .finally(() => setBookletsLoading(false));
  }, [trackId]);

  // Load employees when track + booklet + date are all set
  const loadEmployees = useCallback(async () => {
    if (!trackId || !bookletId || !date) return;
    setEmployeesLoading(true);
    try {
      const { data } = await absencesApi.getEmployeesByTrackBooklet(trackId, bookletId, date);
      setEmployees(data.employees);
      setDrafts({});
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل تحميل قائمة الموظفين';
      toast.error(typeof msg === 'string' ? msg : 'فشل تحميل قائمة الموظفين');
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, [trackId, bookletId, date]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // ─── Selection helpers ───
  const selectedIds = useMemo(
    () => Object.entries(drafts).filter(([, r]) => r.selected).map(([id]) => id),
    [drafts],
  );
  const selectableCount = employees.filter((e) => !e.existingAbsence).length;
  const allSelected = selectableCount > 0 && selectedIds.length === selectableCount;

  const toggleRow = (employeeId: string) => {
    setDrafts((prev) => {
      const current = prev[employeeId];
      if (current) {
        return { ...prev, [employeeId]: { ...current, selected: !current.selected } };
      }
      return {
        ...prev,
        [employeeId]: { selected: true, type: 'ABSENT', reason: '', hours: '' },
      };
    });
  };

  const updateDraft = (employeeId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? { selected: true, type: 'ABSENT', reason: '', hours: '' }), ...patch },
    }));
  };

  const toggleAll = () => {
    if (allSelected) {
      setDrafts({});
      return;
    }
    const next: Record<string, RowDraft> = {};
    employees
      .filter((e) => !e.existingAbsence)
      .forEach((e) => {
        next[e.id] = drafts[e.id]?.selected
          ? drafts[e.id]
          : { selected: true, type: 'ABSENT', reason: '', hours: '' };
      });
    setDrafts(next);
  };

  // ─── Save ───
  const handleSave = async () => {
    if (selectedIds.length === 0 || !trackId || !bookletId || !date) return;
    setSaving(true);
    const tid = toast.loading('جاري حفظ الغيابات…');
    try {
      const payload = {
        trackId,
        bookletId,
        absenceDate: date,
        globalReason: globalReason.trim() || undefined,
        employees: selectedIds.map((employeeId) => {
          const d = drafts[employeeId];
          const hours = d.hours.trim() ? Number(d.hours) : undefined;
          return {
            employeeId,
            type: d.type,
            ...(d.reason.trim() ? { reason: d.reason.trim() } : {}),
            ...(hours != null && !Number.isNaN(hours) ? { hours } : {}),
          };
        }),
      };
      const { data } = await absencesApi.createBulk(payload);
      toast.success(`تم تسجيل ${data.createdCount} غياب`, { id: tid });
      await loadEmployees();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل حفظ الغيابات';
      toast.error(typeof msg === 'string' ? msg : 'فشل حفظ الغيابات', { id: tid });
    } finally {
      setSaving(false);
    }
  };

  if (!canRecord) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط لمدير النظام / المسؤولين</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Users className="w-7 h-7 text-brand-400" />
            تسجيل الغياب الجماعي
          </h1>
          <p className="text-gray-400 mt-1">
            اختر المسار والكراسة والتاريخ لتسجيل غيابات مجموعة من الموظفين دفعة واحدة.
          </p>
        </div>
        <Link
          href="/attendance"
          className="text-xs px-3 py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          عودة للحضور والانصراف
        </Link>
      </div>

      {/* ─── Filters ─── */}
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-xl bg-brand-500/20 p-2.5">
            <CalendarDays className="w-5 h-5 text-brand-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">تحديد المسار والكراسة والتاريخ</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              ستظهر فقط الموظفون المرتبطون بهذا المسار وهذه الكراسة في تاريخ التسجيل.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1.5 block">المسار</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={tracksLoading}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-400/60 disabled:opacity-50"
            >
              <option value="">اختر المسار</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.nameAr || t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1.5 block">الكراسة</label>
            <select
              value={bookletId}
              onChange={(e) => setBookletId(e.target.value)}
              disabled={!trackId || bookletsLoading}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-400/60 disabled:opacity-50"
            >
              <option value="">{!trackId ? 'اختر المسار أولاً' : booklets.length === 0 && !bookletsLoading ? 'لا توجد كراسات لهذا المسار' : 'اختر الكراسة'}</option>
              {booklets.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.nameAr}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1.5 block">تاريخ الغياب</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-400/60"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-400 mb-1.5 block">سبب موحّد لكل الغيابات (اختياري)</label>
          <input
            type="text"
            value={globalReason}
            onChange={(e) => setGlobalReason(e.target.value)}
            placeholder="مثال: ظرف عام، إغلاق المكتب، إلخ — يُستخدم لمن لم يُكتب له سبب خاص"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-400/60"
          />
        </div>
      </div>

      {/* ─── Employees Table ─── */}
      {trackId && bookletId && (
        <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-brand-500/20 p-2.5">
                <Users className="w-5 h-5 text-brand-300" />
              </div>
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  الموظفون
                  <span className="text-sm text-gray-400 font-normal">({employees.length})</span>
                  {selectedIds.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                      {selectedIds.length} محدد
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  حدّد الموظفين المتغيّبين، اختر نوع الغياب لكل واحد، ثم احفظ.
                </p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={selectedIds.length === 0 || saving}
              className="text-sm px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الغيابات ({selectedIds.length})
            </button>
          </div>

          {employeesLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
              <Users className="w-10 h-10 opacity-50" />
              <p className="text-sm">لا يوجد موظفون مُعيّنون لهذه الكراسة في هذا التاريخ.</p>
              <p className="text-xs text-gray-500">عيّن موظفين عبر إدارة الكراسات أولاً.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-gray-300">
                  <tr>
                    <th className="px-3 py-2.5 text-right w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="accent-brand-500"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">الموظف</th>
                    <th className="px-3 py-2.5 text-right font-medium">المسمى</th>
                    <th className="px-3 py-2.5 text-right font-medium">القسم</th>
                    <th className="px-3 py-2.5 text-right font-medium">نوع الغياب</th>
                    <th className="px-3 py-2.5 text-right font-medium">الساعات</th>
                    <th className="px-3 py-2.5 text-right font-medium">سبب خاص</th>
                    <th className="px-3 py-2.5 text-right font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const draft = drafts[emp.id];
                    const hasExisting = !!emp.existingAbsence;
                    const isSelected = !!draft?.selected;
                    return (
                      <tr
                        key={emp.id}
                        className={`border-t border-white/5 ${hasExisting ? 'bg-white/[0.015] opacity-70' : ''}`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(emp.id)}
                            disabled={hasExisting}
                            className="accent-brand-500 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-gray-100">
                          <div className="font-medium">{emp.fullNameAr || emp.fullName}</div>
                          {emp.email && <div className="text-xs text-gray-500">{emp.email}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">{emp.positionAr || emp.position || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-400">{emp.department || '—'}</td>
                        <td className="px-3 py-2.5">
                          <select
                            value={draft?.type ?? 'ABSENT'}
                            onChange={(e) => updateDraft(emp.id, { type: e.target.value as AbsenceTypeKey })}
                            disabled={!isSelected || hasExisting}
                            className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-gray-100 disabled:opacity-40"
                          >
                            {ABSENCE_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            placeholder="—"
                            value={draft?.hours ?? ''}
                            onChange={(e) => updateDraft(emp.id, { hours: e.target.value })}
                            disabled={!isSelected || hasExisting}
                            className="w-20 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-gray-100 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            placeholder="سبب خاص…"
                            value={draft?.reason ?? ''}
                            onChange={(e) => updateDraft(emp.id, { reason: e.target.value })}
                            disabled={!isSelected || hasExisting}
                            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-gray-100 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {hasExisting ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                              <Clock3 className="w-3 h-3" />
                              {ABSENCE_TYPE_LABEL[emp.existingAbsence!.type]} — {ABSENCE_STATUS_LABEL[emp.existingAbsence!.status]}
                            </span>
                          ) : isSelected ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 flex items-center gap-1 w-fit">
                              <Check className="w-3 h-3" />
                              سيُسجَّل
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3" />
                              حاضر
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
