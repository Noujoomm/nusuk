'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users, UserCheck, UserX, Clock, AlertTriangle, RefreshCw, Loader2,
  Shield, Search, Settings, CheckCircle, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { attendanceApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { cn, formatNumber } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  present: { label: 'حاضر', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  late: { label: 'متأخر', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  absent: { label: 'غائب', color: 'text-red-400', bg: 'bg-red-500/20' },
  incomplete: { label: 'غير مكتمل', color: 'text-sky-400', bg: 'bg-sky-500/20' },
};

export default function AttendancePage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isHR = user?.role === 'hr';
  const canView = isAdmin || isHR || user?.role === 'pm';

  const load = useCallback(async () => {
    try { const { data: d } = await attendanceApi.summary(date); setData(d); }
    catch {} finally { setLoading(false); }
  }, [date]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: r } = await attendanceApi.sync();
      if (r.success) { toast.success(`تم المزامنة — ${r.processed} سجل`); load(); }
      else toast.error(r.error || 'فشلت المزامنة');
    } catch { toast.error('فشلت المزامنة'); }
    finally { setSyncing(false); }
  };

  const loadConfig = async () => {
    try { const { data: c } = await attendanceApi.getConfig(); setConfig(c); }
    catch {}
  };

  const saveConfig = async () => {
    try {
      await attendanceApi.updateConfig({
        baseUrl: config.baseUrl, username: config.username,
        workStartTime: config.workStartTime, graceMinutes: parseInt(config.graceMinutes) || 15,
        syncInterval: parseInt(config.syncInterval) || 30,
        employeesEndpoint: config.employeesEndpoint,
        transactionsEndpoint: config.transactionsEndpoint,
      });
      toast.success('تم حفظ الإعدادات');
    } catch { toast.error('فشل الحفظ'); }
  };

  const testConn = async () => {
    setTesting(true);
    try {
      const { data: r } = await attendanceApi.testConnection();
      if (r.success) toast.success(r.message);
      else toast.error(r.message);
    } catch { toast.error('فشل الاختبار'); }
    finally { setTesting(false); }
  };

  if (!canView) return <div className="flex items-center justify-center py-20 text-gray-400"><Shield className="w-12 h-12" /></div>;

  const records = (data?.records || []).filter((r: any) => {
    if (search && !r.empName.includes(search) && !r.empCode.includes(search)) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/20"><UserCheck className="w-6 h-6 text-sky-400" /></div>
          <div><h1 className="text-2xl font-bold">الحضور والانصراف</h1><p className="text-gray-400 text-sm">ZKTeco BioTime Integration</p></div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setLoading(true); }} className="input-field text-sm w-40" />
          {isAdmin && (
            <>
              <button onClick={() => { setShowSettings(!showSettings); if (!config) loadConfig(); }} className="rounded-xl bg-white/5 p-2 text-gray-300 hover:bg-white/10"><Settings className="w-4 h-4" /></button>
              <button onClick={handleSync} disabled={syncing} className="btn-primary px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2">
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} مزامنة
              </button>
            </>
          )}
        </div>
      </div>

      {/* Admin Settings */}
      {showSettings && config && isAdmin && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">إعدادات BioTime</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'baseUrl', l: 'Base URL', ph: 'https://biotime.example.com' },
              { k: 'username', l: 'اسم المستخدم' },
              { k: 'workStartTime', l: 'بداية الدوام', ph: '09:00' },
              { k: 'graceMinutes', l: 'فترة السماح (دقائق)' },
              { k: 'employeesEndpoint', l: 'Employees Endpoint' },
              { k: 'transactionsEndpoint', l: 'Transactions Endpoint' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-xs text-gray-400 mb-1">{f.l}</label>
                <input type="text" placeholder={f.ph || ''} value={config[f.k] || ''} className="input-field text-sm"
                  onChange={(e) => setConfig({ ...config, [f.k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {config.lastSyncAt && <span className="text-[10px] text-gray-500">آخر مزامنة: {new Date(config.lastSyncAt).toLocaleString('ar-SA')} — {config.lastSyncStatus}</span>}
            <div className="flex-1" />
            <button onClick={testConn} disabled={testing} className="rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'اختبار الاتصال'}
            </button>
            <button onClick={saveConfig} className="btn-primary px-4 py-2 text-sm">حفظ</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : (<>
        {/* KPI Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { l: 'إجمالي', v: data.total, c: '#8B5CF6', icon: Users },
              { l: 'حاضرون', v: data.present, c: '#34D399', icon: UserCheck },
              { l: 'متأخرون', v: data.late, c: '#FBBF24', icon: Clock },
              { l: 'غائبون', v: data.absent, c: '#F87171', icon: UserX },
              { l: 'نسبة الحضور', v: `${data.attendanceRate}%`, c: data.attendanceRate >= 80 ? '#34D399' : '#F87171', icon: CheckCircle },
              { l: 'نسبة التأخير', v: `${data.lateRate}%`, c: data.lateRate <= 15 ? '#34D399' : '#F87171', icon: AlertTriangle },
            ].map((k, i) => (
              <div key={i} className="analytics-card" style={{ borderBottom: `2px solid ${k.c}` }}>
                <div className="flex items-center gap-3">
                  <k.icon className="w-5 h-5" style={{ color: k.c }} />
                  <div><p className="text-xl font-bold text-white tabular-nums">{k.v}</p><p className="text-[10px] text-gray-400">{k.l}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..." className="input-field text-sm pr-10 w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field text-sm w-40">
            <option value="">جميع الحالات</option>
            <option value="present">حاضر</option>
            <option value="late">متأخر</option>
            <option value="absent">غائب</option>
            <option value="incomplete">غير مكتمل</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 overflow-x-auto">
          {records.length === 0 ? (
            <div className="text-center py-12"><UserCheck className="w-10 h-10 text-gray-500 mx-auto mb-3" /><p className="text-sm text-gray-400">لا توجد سجلات حضور لهذا اليوم</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10">
                {['الرقم', 'الاسم', 'الدخول', 'الخروج', 'مدة العمل', 'التأخير', 'الحالة'].map((h, i) => (
                  <th key={i} className="py-2.5 px-3 text-xs text-gray-400 font-medium text-right">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {records.map((r: any) => {
                  const st = STATUS_MAP[r.status] || STATUS_MAP.absent;
                  return (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 text-xs text-gray-300 tabular-nums">{r.empCode}</td>
                      <td className="py-2.5 px-3 text-sm text-white font-medium">{r.empName || '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-gray-300 tabular-nums">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-gray-300 tabular-nums">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-white tabular-nums">{r.workMinutes > 0 ? `${Math.floor(r.workMinutes / 60)}س ${r.workMinutes % 60}د` : '—'}</td>
                      <td className={cn('py-2.5 px-3 text-xs tabular-nums', r.lateMinutes > 0 ? 'text-amber-400' : 'text-gray-500')}>{r.lateMinutes > 0 ? `${r.lateMinutes} دقيقة` : '—'}</td>
                      <td className="py-2.5 px-3"><span className={cn('text-[10px] px-2.5 py-0.5 rounded-full', st.bg, st.color)}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>)}
    </div>
  );
}
