'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Database, Download, Shield, AlertTriangle, CheckCircle,
  Info, Loader2, RefreshCw, HardDrive, FileJson,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { adminExportApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';

interface ModelStat {
  name: string;
  nameAr: string;
  count: number;
  icon: string;
}

interface SystemStats {
  timestamp: string;
  models: ModelStat[];
  totalRecords: number;
}

interface IntegrityIssue {
  severity: 'error' | 'warning' | 'info';
  model: string;
  message: string;
  count?: number;
}

interface IntegrityReport {
  timestamp: string;
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  issues: IntegrityIssue[];
}

export default function SystemExportPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);

  const isAdmin = user?.role === 'admin';

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await adminExportApi.systemStats();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const runIntegrityCheck = useCallback(async () => {
    try {
      setIntegrityLoading(true);
      const { data } = await adminExportApi.integrityCheck();
      setIntegrity(data);
    } catch {
      // silent
    } finally {
      setIntegrityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadStats();
    runIntegrityCheck();
  }, [isAdmin, loadStats, runIntegrityCheck]);

  const handleJsonExport = async () => {
    try {
      setExportLoading(true);
      const { data } = await adminExportApi.fullExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ruya-full-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('فشل تصدير البيانات');
    } finally {
      setExportLoading(false);
    }
  };

  const handleZipExport = async () => {
    try {
      setZipLoading(true);
      const { data } = await adminExportApi.downloadZip();
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ruya-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('فشل تحميل النسخة الاحتياطية');
    } finally {
      setZipLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Shield className="h-12 w-12" />
        <p className="text-sm">هذه الصفحة متاحة فقط لمدير النظام</p>
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

  const displayedModels = showAllModels ? (stats?.models || []) : (stats?.models || []).slice(0, 12);

  const SEVERITY_CONFIG = {
    error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'خطأ' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'تحذير' },
    info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'معلومة' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Database className="w-7 h-7 text-brand-400" />
            النظام والنسخ الاحتياطي
          </h1>
          <p className="text-gray-400 mt-1">استعراض بيانات النظام وتصدير النسخ الاحتياطية والتحقق من سلامة البيانات</p>
        </div>
        <button
          onClick={loadStats}
          className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          تحديث
        </button>
      </div>

      {/* Export Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/20">
              <FileJson className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">تصدير JSON كامل</h3>
              <p className="text-xs text-gray-400 mt-0.5">تصدير جميع بيانات النظام كملف JSON منظم</p>
            </div>
          </div>
          <button
            onClick={handleJsonExport}
            disabled={exportLoading}
            className="w-full rounded-xl bg-brand-500/20 px-4 py-3 text-sm font-medium text-brand-300 hover:bg-brand-500/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {exportLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> جاري التصدير...</>
            ) : (
              <><Download className="h-4 w-4" /> تصدير البيانات الكاملة</>
            )}
          </button>
        </div>

        <div className="glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-emerald-500/20">
              <HardDrive className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">نسخة احتياطية ZIP</h3>
              <p className="text-xs text-gray-400 mt-0.5">تحميل نسخة احتياطية شاملة مع ملفات مفصلة لكل مسار</p>
            </div>
          </div>
          <button
            onClick={handleZipExport}
            disabled={zipLoading}
            className="w-full rounded-xl bg-emerald-500/20 px-4 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {zipLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...</>
            ) : (
              <><Download className="h-4 w-4" /> تحميل النسخة الاحتياطية</>
            )}
          </button>
        </div>
      </div>

      {/* System Stats Overview */}
      {stats && (
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-300">
              <Database className="w-4 h-4 text-brand-400" />
              إحصائيات النظام
              <span className="text-xs text-gray-500 font-normal">({formatNumber(stats.totalRecords)} سجل)</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {displayedModels.map((model) => (
              <div key={model.name} className="bg-white/5 rounded-xl p-3 hover:bg-white/8 transition-colors">
                <p className="text-lg font-bold text-white">{formatNumber(model.count)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{model.nameAr}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{model.name}</p>
              </div>
            ))}
          </div>

          {(stats.models.length > 12) && (
            <button
              onClick={() => setShowAllModels(!showAllModels)}
              className="mt-3 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
            >
              {showAllModels ? (
                <><ChevronUp className="w-3.5 h-3.5" /> عرض أقل</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> عرض الكل ({stats.models.length} نموذج)</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Data Integrity Report */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-300">
            <Shield className="w-4 h-4 text-brand-400" />
            فحص سلامة البيانات
          </h2>
          <button
            onClick={runIntegrityCheck}
            disabled={integrityLoading}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {integrityLoading ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> جاري الفحص...</>
            ) : (
              <><RefreshCw className="h-3 w-3" /> إعادة الفحص</>
            )}
          </button>
        </div>

        {integrityLoading && !integrity ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
          </div>
        ) : integrity ? (
          <>
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3 mb-4">
              {integrity.errors > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {integrity.errors} أخطاء
                </div>
              )}
              {integrity.warnings > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {integrity.warnings} تحذيرات
                </div>
              )}
              {integrity.info > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs text-blue-300">
                  <Info className="w-3.5 h-3.5" />
                  {integrity.info} معلومات
                </div>
              )}
              {integrity.totalIssues === 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300">
                  <CheckCircle className="w-3.5 h-3.5" />
                  لا توجد مشاكل — البيانات سليمة
                </div>
              )}
            </div>

            {/* Issues list */}
            {integrity.issues.length > 0 && (
              <div className="space-y-2">
                {integrity.issues.map((issue, idx) => {
                  const config = SEVERITY_CONFIG[issue.severity];
                  return (
                    <div key={idx} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                      <div className={cn('p-1.5 rounded-lg shrink-0', config.bg)}>
                        <config.icon className={cn('w-3.5 h-3.5', config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', config.bg, config.color)}>
                            {config.label}
                          </span>
                          <span className="text-xs text-gray-500">{issue.model}</span>
                        </div>
                        <p className="text-sm text-gray-300 mt-1">{issue.message}</p>
                      </div>
                      {issue.count !== undefined && (
                        <span className="text-xs text-gray-500 shrink-0">{formatNumber(issue.count)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
