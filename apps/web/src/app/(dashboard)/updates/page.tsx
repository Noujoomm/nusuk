'use client';

import { useEffect, useState, useCallback } from 'react';
import { auditApi, dailyUpdatesApi, tracksApi } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { formatDate } from '@/lib/utils';
import {
  Activity, ChevronLeft, ChevronRight, Filter, X, Pin, PinOff,
  Plus, Edit3, Trash2, Upload, Download, UserPlus, RefreshCw,
  GitBranch, Users, Package, Target, AlertTriangle, ClipboardList,
  FileText, CheckSquare, Shield, Bell, MessageSquare, Search,
  Megaphone, Globe, Zap, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Audit Labels & Config ───

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء', update: 'تعديل', delete: 'حذف',
  login: 'تسجيل دخول', logout: 'تسجيل خروج',
  upload: 'رفع ملف', download: 'تحميل', assign: 'تعيين', status_change: 'تغيير حالة',
};

const ACTION_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  create: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: Plus },
  update: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: Edit3 },
  delete: { bg: 'bg-red-500/15', text: 'text-red-400', icon: Trash2 },
  login: { bg: 'bg-violet-500/15', text: 'text-violet-400', icon: Shield },
  logout: { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: Shield },
  upload: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: Upload },
  download: { bg: 'bg-teal-500/15', text: 'text-teal-400', icon: Download },
  assign: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', icon: UserPlus },
  status_change: { bg: 'bg-orange-500/15', text: 'text-orange-400', icon: RefreshCw },
};

const ENTITY_LABELS: Record<string, string> = {
  track: 'مسار', record: 'سجل', employee: 'موظف', deliverable: 'مخرج',
  track_kpi: 'مؤشر أداء', kpi_entry: 'قياس أداء', penalty: 'غرامة',
  scope: 'نطاق عمل', scope_block: 'كتلة نطاق', report: 'تقرير', file: 'ملف',
  user: 'مستخدم', task: 'مهمة', comment: 'تعليق', daily_update: 'تحديث',
  subtask: 'مهمة فرعية', notification: 'إشعار', achievement: 'إنجاز', progress: 'تقدم',
};

const ENTITY_ICONS: Record<string, any> = {
  track: GitBranch, record: FileText, employee: Users, deliverable: Package,
  track_kpi: Target, kpi_entry: Target, penalty: AlertTriangle,
  scope: ClipboardList, scope_block: ClipboardList, report: FileText,
  file: FileText, user: Users, task: CheckSquare, comment: MessageSquare,
  daily_update: Megaphone, notification: Bell,
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  normal: { label: 'عادي', color: 'text-gray-400', bg: 'bg-gray-500/15' },
  important: { label: 'مهم', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  urgent: { label: 'عاجل', color: 'text-red-400', bg: 'bg-red-500/15' },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any }> = {
  global: { label: 'عام', icon: Globe },
  track: { label: 'مسار', icon: GitBranch },
  department: { label: 'قسم', icon: Users },
};

// ─── Helpers ───

const formatTimeAgo = (dateStr: string) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  return formatDate(dateStr);
};

// ─── Main Page ───

export default function UpdatesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'updates' | 'activity'>('updates');

  const isAdmin = user?.role === 'admin' || user?.role === 'pm';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">التحديثات</h1>
          <p className="text-gray-400 text-sm mt-1">آخر الأخبار والتحديثات وسجل النشاط</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'updates' as const, label: 'التحديثات اليومية', icon: Megaphone },
          { key: 'activity' as const, label: 'سجل النشاط', icon: Activity },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-brand-500/20 text-brand-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'updates' && <DailyUpdatesTab isAdmin={isAdmin} userId={user?.id || ''} />}
      {activeTab === 'activity' && <ActivityLogTab />}
    </div>
  );
}

// ─── Daily Updates Tab ───

function DailyUpdatesTab({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const [updates, setUpdates] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUpdates = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize: 15 };
      if (searchText) params.search = searchText;
      if (typeFilter) params.type = typeFilter;
      const { data } = await dailyUpdatesApi.list(params);
      setUpdates(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      toast.error('فشل تحميل التحديثات');
    }
    setLoading(false);
  }, [page, searchText, typeFilter]);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  useEffect(() => {
    tracksApi.list().then(({ data }) => setTracks(data)).catch(() => {});
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التحديث؟')) return;
    try {
      await dailyUpdatesApi.delete(id);
      toast.success('تم حذف التحديث');
      loadUpdates();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      await dailyUpdatesApi.togglePin(id);
      loadUpdates();
    } catch {
      toast.error('فشلت العملية');
    }
  };

  const handleMarkAsRead = async (updateId: string) => {
    try {
      await dailyUpdatesApi.markAsRead(updateId);
      setUpdates((prev) => prev.map((u) => u.id === updateId ? { ...u, isRead: true } : u));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllAsRead = async () => {
    try {
      await dailyUpdatesApi.markAllAsRead();
      setUpdates((prev) => prev.map((u) => ({ ...u, isRead: true })));
      setUnreadCount(0);
    } catch {
      toast.error('فشلت العملية');
    }
  };

  return (
    <>
      {/* Top bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث في التحديثات..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            className="input-field pr-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="input-field w-auto text-sm"
        >
          <option value="">كل الأنواع</option>
          <option value="global">عام</option>
          <option value="track">مسار</option>
          <option value="department">قسم</option>
        </select>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-xs text-gray-400 hover:bg-white/10 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            تعيين الكل كمقروء ({unreadCount})
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => { setEditTarget(null); setShowCreateModal(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            تحديث جديد
          </button>
        )}
      </div>

      {/* Updates Feed */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : updates.length === 0 ? (
        <div className="glass p-12 text-center">
          <Megaphone className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">لا توجد تحديثات بعد</p>
          {isAdmin && (
            <button onClick={() => setShowCreateModal(true)} className="mt-3 text-sm text-brand-400 hover:text-brand-300">
              أنشئ أول تحديث
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {updates.map((update: any) => {
            const priorityConf = PRIORITY_CONFIG[update.priority] || PRIORITY_CONFIG.normal;
            const typeConf = TYPE_CONFIG[update.type] || TYPE_CONFIG.global;
            const TypeIcon = typeConf.icon;
            const canManage = isAdmin;

            return (
              <div
                key={update.id}
                className={`glass p-5 relative cursor-pointer transition-colors ${update.pinned ? 'border border-amber-500/20' : ''} ${!update.isRead ? 'border-r-2 border-r-brand-500' : ''}`}
                onClick={() => { if (!update.isRead) handleMarkAsRead(update.id); }}
              >
                {/* Unread dot */}
                {!update.isRead && (
                  <div className="absolute top-4 left-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                  </div>
                )}
                {/* Pinned indicator */}
                {update.pinned && (
                  <div className={`absolute ${!update.isRead ? 'top-3 left-10' : 'top-3 left-3'}`}>
                    <Pin className="w-4 h-4 text-amber-400" />
                  </div>
                )}

                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-300 shrink-0">
                      {update.author?.nameAr?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{update.author?.nameAr || update.author?.name}</span>
                        <span className="text-xs text-gray-600">|</span>
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(update.createdAt)}
                        </span>
                      </div>
                      <h3 className="font-bold text-base mt-1">{update.titleAr || update.title}</h3>
                    </div>
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      {isAdmin && (
                        <button onClick={() => handleTogglePin(update.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-amber-400 transition-colors" title={update.pinned ? 'إلغاء التثبيت' : 'تثبيت'}>
                          {update.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => { setEditTarget(update); setShowCreateModal(true); }} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(update.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line mr-[52px]">
                  {update.contentAr || update.content}
                </div>

                {/* Meta badges */}
                <div className="flex items-center gap-2 mt-3 mr-[52px] flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${priorityConf.bg} ${priorityConf.color}`}>
                    <Zap className="w-3 h-3" />
                    {priorityConf.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-white/5 text-gray-400">
                    <TypeIcon className="w-3 h-3" />
                    {typeConf.label}
                  </span>
                  {update.track && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md text-gray-400" style={{ backgroundColor: `${update.track.color}15`, color: update.track.color }}>
                      <GitBranch className="w-3 h-3" />
                      {update.track.nameAr}
                    </span>
                  )}
                  {update.editHistory && (update.editHistory as any[]).length > 0 && (
                    <span className="text-xs text-gray-600">(معدّل)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="glass p-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">صفحة {page} من {totalPages}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CreateUpdateModal
          data={editTarget}
          tracks={tracks}
          onClose={() => { setShowCreateModal(false); setEditTarget(null); }}
          onSave={() => { setShowCreateModal(false); setEditTarget(null); loadUpdates(); }}
        />
      )}
    </>
  );
}

// ─── Create/Edit Modal ───

function CreateUpdateModal({ data, tracks, onClose, onSave }: {
  data: any | null;
  tracks: any[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = !!data;
  const [form, setForm] = useState({
    title: data?.title || '',
    titleAr: data?.titleAr || '',
    content: data?.content || '',
    contentAr: data?.contentAr || '',
    type: data?.type || 'global',
    trackId: data?.trackId || '',
    priority: data?.priority || 'normal',
    pinned: data?.pinned || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titleAr.trim() || !form.content.trim()) {
      toast.error('يرجى تعبئة العنوان والمحتوى');
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.title) payload.title = payload.titleAr;
      if (!payload.trackId) delete payload.trackId;
      if (isEdit) {
        await dailyUpdatesApi.update(data.id, payload);
      } else {
        await dailyUpdatesApi.create(payload);
      }
      toast.success(isEdit ? 'تم تعديل التحديث' : 'تم نشر التحديث');
      onSave();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشلت العملية');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">{isEdit ? 'تعديل تحديث' : 'نشر تحديث جديد'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">العنوان *</label>
            <input
              type="text"
              value={form.titleAr}
              onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
              className="input-field"
              placeholder="عنوان التحديث..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">المحتوى *</label>
            <textarea
              value={form.contentAr || form.content}
              onChange={(e) => setForm({ ...form, contentAr: e.target.value, content: e.target.value })}
              className="input-field min-h-[120px] resize-y"
              placeholder="اكتب تفاصيل التحديث..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">النوع</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="global">عام</option>
                <option value="track">مسار محدد</option>
                <option value="department">قسم</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">الأهمية</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input-field">
                <option value="normal">عادي</option>
                <option value="important">مهم</option>
                <option value="urgent">عاجل</option>
              </select>
            </div>
          </div>

          {form.type === 'track' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">المسار</label>
              <select value={form.trackId} onChange={(e) => setForm({ ...form, trackId: e.target.value })} className="input-field">
                <option value="">اختر المسار...</option>
                {tracks.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.nameAr}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">العنوان (إنجليزي)</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input-field"
              dir="ltr"
              placeholder="English title (optional)"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pinned"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="w-4 h-4 rounded border-white/20 bg-white/5"
            />
            <label htmlFor="pinned" className="text-sm text-gray-400">تثبيت التحديث</label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex-1 btn-primary disabled:opacity-50">
              {saving ? 'جاري النشر...' : isEdit ? 'حفظ التعديلات' : 'نشر التحديث'}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-2 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 text-sm font-medium transition-colors">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Log Tab ───

function ActivityLogTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    loadActivity();
  }, [page, entityFilter, actionFilter]);

  const loadActivity = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize: 30 };
      if (entityFilter) params.entityType = entityFilter;
      if (actionFilter) params.actionType = actionFilter;
      const { data } = await auditApi.list(params);
      setEntries(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('فشل تحميل سجل النشاط');
    }
    setLoading(false);
  };

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Filter className="w-4 h-4" />
          <span>تصفية:</span>
        </div>
        <select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          className="input-field w-auto text-sm"
        >
          <option value="">كل الكيانات</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="input-field w-auto text-sm"
        >
          <option value="">كل العمليات</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(entityFilter || actionFilter) && (
          <button onClick={() => { setEntityFilter(''); setActionFilter(''); setPage(1); }} className="text-xs text-brand-400 hover:text-brand-300">
            مسح الفلاتر
          </button>
        )}
        <span className="text-xs text-gray-600 mr-auto">{total} سجل</span>
      </div>

      {/* Activity Feed */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="glass p-12 text-center">
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">لا يوجد نشاط</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: any, i: number) => {
            const style = ACTION_COLORS[entry.actionType] || { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: Activity };
            const ActionIcon = style.icon;
            const EntityIcon = ENTITY_ICONS[entry.entityType] || Activity;

            const actor = entry.actor?.nameAr || entry.actor?.name || 'النظام';
            const action = ACTION_LABELS[entry.actionType] || entry.actionType;
            const entity = ENTITY_LABELS[entry.entityType] || entry.entityType;
            const data = entry.afterData || entry.beforeData;
            let entityName = '';
            if (data) {
              entityName = data.nameAr || data.titleAr || data.fullNameAr || data.violationAr || data.name || data.title || data.fullName || '';
              if (entityName && entityName.length > 60) entityName = entityName.substring(0, 60) + '...';
            }

            const entryDate = new Date(entry.createdAt).toLocaleDateString('ar-SA');
            const prevDate = i > 0 ? new Date(entries[i - 1].createdAt).toLocaleDateString('ar-SA') : null;
            const showDateSeparator = entryDate !== prevDate;

            return (
              <div key={entry.id}>
                {showDateSeparator && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-gray-500 font-medium">{entryDate}</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                )}
                <div className="glass p-4 hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${style.bg} shrink-0 mt-0.5`}>
                      <ActionIcon className={`w-4 h-4 ${style.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm">
                            <span className="font-semibold text-white">{actor}</span>
                            <span className="text-gray-400 mx-1.5">قام بـ</span>
                            <span className={`font-medium ${style.text}`}>{action}</span>
                            <span className="text-gray-400 mx-1.5">{entity}</span>
                          </p>
                          {entityName && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{entityName}</p>}
                        </div>
                        <span className="text-xs text-gray-600 shrink-0 mt-0.5">{formatTimeAgo(entry.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        {entry.track && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-white/5 text-gray-400">
                            <GitBranch className="w-3 h-3" />
                            {entry.track.nameAr}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-white/5 text-gray-400">
                          <EntityIcon className="w-3 h-3" />
                          {entity}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="glass p-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">صفحة {page} من {totalPages}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
