'use client';

import { useCallback, useState } from 'react';
import {
  Fingerprint,
  Shield,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/stores/auth';
import { attendanceApi } from '@/lib/api';

interface SeedResult {
  totalRowsRead: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ sheet: string; row: number; reason: string }>;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastResult, setLastResult] = useState<SeedResult | null>(null);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('يجب أن يكون الملف بصيغة Excel (.xlsx أو .xls)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 5 ميجابايت');
      return;
    }

    setIsUploading(true);
    setLastResult(null);
    const tid = toast.loading('جاري معالجة الملف…');
    try {
      const { data } = await attendanceApi.seedEmployees(file);
      setLastResult(data);
      toast.success(
        `تم: ${data.created} موظف جديد، ${data.updated} تحديث`,
        { id: tid },
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل رفع الملف';
      toast.error(typeof msg === 'string' ? msg : 'فشل رفع الملف', { id: tid });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط لمدير النظام</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Fingerprint className="w-7 h-7 text-brand-400" />
          الحضور والانصراف
        </h1>
        <p className="text-gray-400 mt-1">
          إدارة بيانات الحضور والانصراف اليومي وتوليد التقارير الرسمية
        </p>
      </div>

      {/* Phase 1 Card — Employee Seeder */}
      <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-xl bg-brand-500/20 p-2.5">
            <Users className="w-5 h-5 text-brand-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">قائمة الموظفين الرئيسية</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              ارفع ملف Excel "جدول الحضور — كل المسارات" مرة واحدة لتعريف الموظفين في النظام.
              يدعم الإملاء "الانصراف" و "الانصارف" تلقائياً.
            </p>
          </div>
        </div>

        <label
          htmlFor="seed-file"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? 'border-brand-400 bg-brand-500/10'
              : 'border-white/15 hover:border-white/30 bg-white/[0.02]'
          } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            id="seed-file"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
              <p className="text-sm text-gray-300">جارٍ معالجة الملف…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <UploadCloud className="w-10 h-10 text-gray-400" />
              <p className="text-sm text-gray-300">
                اسحب ملف Excel هنا أو <span className="text-brand-300">اضغط للاختيار</span>
              </p>
              <p className="text-xs text-gray-500">يدعم .xlsx و .xls — حتى 5MB</p>
            </div>
          )}
        </label>

        {/* Result */}
        {lastResult && (
          <div className="mt-5 rounded-xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <CheckCircle className="w-4 h-4" />
              تمت معالجة الملف
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="إجمالي الصفوف" value={lastResult.totalRowsRead} />
              <Stat label="موظف جديد" value={lastResult.created} accent="emerald" />
              <Stat label="تم التحديث" value={lastResult.updated} accent="blue" />
              <Stat
                label="تم تخطّيه"
                value={lastResult.skipped}
                accent={lastResult.skipped > 0 ? 'amber' : undefined}
              />
            </div>
            {lastResult.errors.length > 0 && (
              <details className="text-xs text-amber-200/90">
                <summary className="cursor-pointer flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {lastResult.errors.length} تنبيه أثناء القراءة
                </summary>
                <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-2">
                  {lastResult.errors.map((e, i) => (
                    <li key={i} className="opacity-80">
                      • [{e.sheet} / صف {e.row}] {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Phase 2 Placeholder */}
      <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/5 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/5 p-2.5">
            <FileSpreadsheet className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-400">رفع تقرير PDF اليومي</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              قريباً — سيمكّنك من رفع ملف PDF اليومي للبصمة وتوليد ملخص الحضور والخطاب الرسمي تلقائياً.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'blue' | 'amber';
}) {
  const accentClass =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'blue'
        ? 'text-blue-300'
        : accent === 'amber'
          ? 'text-amber-300'
          : 'text-gray-200';
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</div>
    </div>
  );
}
