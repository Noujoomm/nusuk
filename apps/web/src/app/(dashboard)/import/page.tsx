'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { importsApi, tracksApi } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import {
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Table2,
  Columns,
  Play,
  History,
  X,
  ChevronDown,
} from 'lucide-react';

interface SheetInfo {
  name: string;
  rowCount: number;
  headers: string[];
  preview: any[];
}

interface FieldDef {
  field: string;
  label: string;
  labelAr: string;
  required?: boolean;
}

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: number;
  total: number;
  errorDetails: any[];
}

interface ImportHistoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  summary: any;
  errorLog: any[];
  createdAt: string;
  author: { name: string; nameAr: string };
}

const ENTITY_TYPES = [
  { value: 'task', label: 'المهام' },
  { value: 'employee', label: 'الموظفون' },
  { value: 'deliverable', label: 'المخرجات' },
  { value: 'penalty', label: 'الغرامات' },
  { value: 'scope', label: 'نطاق العمل' },
  { value: 'track_kpi', label: 'مؤشرات الأداء' },
];

const STEPS = ['رفع الملف', 'اختيار الورقة', 'ربط الأعمدة', 'النتيجة'];

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');

  // Upload state
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File data
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<SheetInfo | null>(null);

  // Sheet data
  const [sheetRows, setSheetRows] = useState<any[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);

  // Mapping state
  const [entityType, setEntityType] = useState('task');
  const [entityFields, setEntityFields] = useState<FieldDef[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [trackId, setTrackId] = useState('');
  const [tracks, setTracks] = useState<any[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // History
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    tracksApi.list().then((res) => setTracks(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await importsApi.history({});
      setHistory(data.data);
    } catch {}
    setHistoryLoading(false);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const { data } = await importsApi.upload(file);
      if (data.error) {
        alert(data.error);
        setUploading(false);
        return;
      }
      setFilePath(data.filePath);
      setFileName(data.fileName || file.name);
      setSheets(data.sheets);
      setStep(1);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'فشل رفع الملف';
      alert(`فشل رفع الملف: ${msg}`);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleSelectSheet = async (sheet: SheetInfo) => {
    setSelectedSheet(sheet);
    setSheetHeaders(sheet.headers);
    setLoadingSheet(true);
    try {
      const { data } = await importsApi.parseSheet(filePath, sheet.name);
      setSheetRows(data.rows);
      setSheetHeaders(data.headers);
      // Load entity fields
      const fieldsRes = await importsApi.getFields(entityType);
      setEntityFields(fieldsRes.data);
      // Auto-map by header similarity
      autoMap(data.headers, fieldsRes.data);
      setStep(2);
    } catch {
      alert('فشل قراءة الورقة');
    }
    setLoadingSheet(false);
  };

  const autoMap = (headers: string[], fields: FieldDef[]) => {
    const newMapping: Record<string, string> = {};
    for (const field of fields) {
      const match = headers.find(
        (h) =>
          h.toLowerCase() === field.field.toLowerCase() ||
          h === field.labelAr ||
          h.toLowerCase().includes(field.label.toLowerCase()) ||
          h.includes(field.labelAr)
      );
      if (match) newMapping[field.field] = match;
    }
    setMapping(newMapping);
  };

  const handleEntityTypeChange = async (type: string) => {
    setEntityType(type);
    try {
      const fieldsRes = await importsApi.getFields(type);
      setEntityFields(fieldsRes.data);
      autoMap(sheetHeaders, fieldsRes.data);
    } catch {}
  };

  const handleExecuteImport = async () => {
    const mappingArray = Object.entries(mapping)
      .filter(([_, excelCol]) => excelCol)
      .map(([dbField, excelColumn]) => ({ dbField, excelColumn }));

    if (mappingArray.length === 0) {
      alert('يرجى ربط عمود واحد على الأقل');
      return;
    }

    // Check required fields
    const requiredFields = entityFields.filter((f) => f.required);
    const missingRequired = requiredFields.filter((f) => !mapping[f.field]);
    if (missingRequired.length > 0) {
      alert(`الحقول المطلوبة: ${missingRequired.map((f) => f.labelAr).join('، ')}`);
      return;
    }

    // Require trackId for non-employee/non-task types (tasks can resolve from CSV)
    if (!['employee', 'task'].includes(entityType) && !trackId) {
      alert('يرجى اختيار المسار');
      return;
    }

    setImporting(true);
    try {
      const { data } = await importsApi.execute({
        entityType,
        mapping: mappingArray,
        rows: sheetRows,
        trackId: trackId || undefined,
        fileName,
      });
      setResult(data);
      setStep(3);
    } catch {
      alert('فشل الاستيراد');
    }
    setImporting(false);
  };

  const resetWizard = () => {
    setStep(0);
    setFilePath('');
    setFileName('');
    setSheets([]);
    setSelectedSheet(null);
    setSheetRows([]);
    setSheetHeaders([]);
    setMapping({});
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">استيراد البيانات</h1>
          <p className="text-gray-400 mt-1">رفع ملفات Excel أو CSV واستيراد المهام والبيانات إلى المنصة</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'import' ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2"><Upload className="w-4 h-4" /> استيراد جديد</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'history' ? 'bg-brand-500/20 text-brand-300' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2"><History className="w-4 h-4" /> سجل الاستيراد</span>
        </button>
      </div>

      {activeTab === 'import' ? (
        <>
          {/* Steps indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  i === step ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30' :
                  i < step ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-500'
                }`}>
                  {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 text-center">{i + 1}</span>}
                  {s}
                </div>
                {i < STEPS.length - 1 && <div className={`w-6 h-px ${i < step ? 'bg-emerald-500/50' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          {/* Step 0: Upload */}
          {step === 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`glass p-16 text-center rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                dragging ? 'border-brand-500 bg-brand-500/5' : 'border-white/10 hover:border-white/20'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-300">جاري رفع الملف...</p>
                </div>
              ) : (
                <>
                  <FileSpreadsheet className="w-16 h-16 text-brand-400/50 mx-auto mb-4" />
                  <p className="text-lg font-medium text-white mb-2">اسحب ملف Excel أو CSV هنا أو اضغط للاختيار</p>
                  <p className="text-sm text-gray-500">يدعم ملفات .xlsx و .xls و .csv (حد أقصى 100MB)</p>
                </>
              )}
            </div>
          )}

          {/* Step 1: Select Sheet */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">اختر الورقة — <span className="text-brand-300">{fileName}</span></h3>
                <button onClick={resetWizard} className="text-sm text-gray-400 hover:text-white transition-colors">
                  رفع ملف آخر
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sheets.map((sheet) => (
                  <button
                    key={sheet.name}
                    onClick={() => handleSelectSheet(sheet)}
                    disabled={loadingSheet}
                    className="glass glass-hover p-5 text-right transition-all hover:border-brand-500/30 border border-transparent rounded-2xl disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-xl bg-brand-500/20">
                        <Table2 className="w-5 h-5 text-brand-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{sheet.name}</h4>
                        <p className="text-xs text-gray-400">{formatNumber(sheet.rowCount)} صف — {sheet.headers.length} عمود</p>
                      </div>
                    </div>
                    {sheet.headers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {sheet.headers.slice(0, 5).map((h) => (
                          <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{h}</span>
                        ))}
                        {sheet.headers.length > 5 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">+{sheet.headers.length - 5}</span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">ربط الأعمدة</h3>
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
                  <ArrowRight className="w-4 h-4" /> رجوع
                </button>
              </div>

              {/* Entity type + Track selectors */}
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">نوع البيانات</label>
                  <select
                    value={entityType}
                    onChange={(e) => handleEntityTypeChange(e.target.value)}
                    className="input-field w-auto"
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {entityType !== 'employee' && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                      المسار {entityType === 'task' ? '(اختياري إذا محدد بالملف)' : ''} <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={trackId}
                      onChange={(e) => setTrackId(e.target.value)}
                      className="input-field w-auto"
                    >
                      <option value="">{entityType === 'task' ? 'اختيار تلقائي من الملف...' : 'اختر المسار...'}</option>
                      {tracks.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.nameAr}</option>
                      ))}
                    </select>
                  </div>
                )}
                {entityType === 'employee' && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">المسار (اختياري)</label>
                    <select
                      value={trackId}
                      onChange={(e) => setTrackId(e.target.value)}
                      className="input-field w-auto"
                    >
                      <option value="">بدون مسار</option>
                      {tracks.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.nameAr}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Mapping table */}
              <div className="glass rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Columns className="w-4 h-4" />
                    <span>ربط أعمدة الملف بحقول قاعدة البيانات</span>
                  </div>
                </div>
                <div className="divide-y divide-white/5">
                  {entityFields.map((field) => (
                    <div key={field.field} className="flex items-center gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">
                          {field.labelAr}
                          {field.required && <span className="text-red-400 mr-1">*</span>}
                        </p>
                        <p className="text-xs text-gray-500">{field.field}</p>
                      </div>
                      <ArrowLeft className="w-4 h-4 text-gray-600 shrink-0" />
                      <select
                        value={mapping[field.field] || ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [field.field]: e.target.value }))}
                        className="input-field w-64"
                      >
                        <option value="">— لا يوجد ربط —</option>
                        {sheetHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {sheetRows.length > 0 && (
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <p className="text-sm text-gray-300">معاينة البيانات ({formatNumber(sheetRows.length)} صف)</p>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-3 py-2 text-right text-gray-500">#</th>
                          {sheetHeaders.slice(0, 8).map((h) => (
                            <th key={h} className="px-3 py-2 text-right text-gray-400 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                            {sheetHeaders.slice(0, 8).map((h) => (
                              <td key={h} className="px-3 py-2 text-gray-300 max-w-[150px] truncate">{row[h] || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Execute button */}
              <div className="flex justify-end">
                <button
                  onClick={handleExecuteImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500/20 text-brand-300 font-medium hover:bg-brand-500/30 transition-colors disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                      جاري الاستيراد...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      تنفيذ الاستيراد ({formatNumber(sheetRows.length)} صف)
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && result && (
            <div className="space-y-4">
              <div className="glass p-8 text-center rounded-2xl">
                {result.errors === 0 ? (
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                ) : (
                  <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                )}
                <h3 className="text-xl font-bold mb-2">
                  {result.errors === 0 ? 'تم الاستيراد بنجاح!' : 'تم الاستيراد مع بعض الأخطاء'}
                </h3>
                <p className="text-gray-400 mb-6">من الملف: {fileName}</p>

                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                  <div className="glass p-4 rounded-xl">
                    <p className="text-2xl font-bold text-emerald-400">{formatNumber(result.inserted)}</p>
                    <p className="text-xs text-gray-400">تم الإضافة</p>
                  </div>
                  <div className="glass p-4 rounded-xl">
                    <p className="text-2xl font-bold text-amber-400">{formatNumber(result.skipped)}</p>
                    <p className="text-xs text-gray-400">تم التخطي</p>
                  </div>
                  <div className="glass p-4 rounded-xl">
                    <p className="text-2xl font-bold text-red-400">{formatNumber(result.errors)}</p>
                    <p className="text-xs text-gray-400">أخطاء</p>
                  </div>
                </div>

                {result.errorDetails && result.errorDetails.length > 0 && (
                  <div className="mt-6 text-right">
                    <p className="text-sm text-gray-400 mb-2">تفاصيل الأخطاء:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {result.errorDetails.map((err, i) => (
                        <div key={i} className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                          صف {err.row}: {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={resetWizard}
                  className="mt-6 flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500/20 text-brand-300 font-medium hover:bg-brand-500/30 transition-colors mx-auto"
                >
                  <Upload className="w-4 h-4" />
                  استيراد ملف آخر
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* History Tab */
        <div className="glass rounded-2xl overflow-hidden">
          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">لا يوجد سجل استيراد</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">الملف</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">المستخدم</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">النتيجة</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="text-white">{item.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{item.author?.nameAr || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        item.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {item.status === 'completed' ? 'مكتمل' : item.status === 'failed' ? 'فشل' : 'تم التراجع'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {item.summary ? (
                        <span>
                          {item.summary.inserted} مضاف / {item.summary.skipped} مُتخطى
                          {item.summary.errors > 0 && <span className="text-red-400"> / {item.summary.errors} خطأ</span>}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(item.createdAt).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
