'use client';

import { useEffect, useState, useRef } from 'react';
import { scopeBlocksApi } from '@/lib/api';
import { cn, formatPercent, SCOPE_STATUS_LABELS, SCOPE_STATUS_COLORS } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import InlineEdit from '@/components/inline-edit';
import {
  ChevronDown,
  ChevronLeft,
  Layers,
  Plus,
  Upload,
  Search,
  BarChart3,
  Paperclip,
  MessageSquare,
  Download,
  Trash2,
  Send,
  FileText,
  X,
  Clock,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

interface ScopeAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  createdAt: string;
  uploadedBy?: { id: string; name: string; nameAr: string };
}

interface ScopeUpdate {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { id: string; name: string; nameAr: string };
}

interface ScopeBlock {
  id: string;
  trackId: string;
  code: string;
  title: string;
  content?: string;
  parentId?: string;
  orderIndex: number;
  progress: number;
  status: string;
  children?: ScopeBlock[];
  attachments?: ScopeAttachment[];
  updates?: ScopeUpdate[];
}

interface ScopeBlocksPanelProps {
  trackId: string;
  trackColor: string;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

export default function ScopeBlocksPanel({ trackId, trackColor }: ScopeBlocksPanelProps) {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<ScopeBlock[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailOpenIds, setDetailOpenIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [newUpdateText, setNewUpdateText] = useState<Record<string, string>>({});
  const [sendingUpdate, setSendingUpdate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFileBlockId, setActiveFileBlockId] = useState<string | null>(null);

  // نطاق العمل: مدير النظام فقط يمكنه التعديل
  const canEdit = user?.role === 'admin';

  const fetchData = async () => {
    try {
      const [blocksRes, statsRes] = await Promise.all([
        scopeBlocksApi.byTrack(trackId),
        scopeBlocksApi.stats(trackId),
      ]);
      setBlocks(blocksRes.data || []);
      setStats(statsRes.data || null);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [trackId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDetail = (id: string) => {
    setDetailOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (items: ScopeBlock[]) => {
      items.forEach((b) => {
        allIds.add(b.id);
        if (b.children) collectIds(b.children);
      });
    };
    collectIds(blocks);
    setExpandedIds(allIds);
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
    setDetailOpenIds(new Set());
  };

  const handleProgressUpdate = async (blockId: string, progress: number) => {
    await scopeBlocksApi.updateProgress(blockId, { progress, status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending' });
    await fetchData();
  };

  const handleTitleUpdate = async (blockId: string, title: string) => {
    await scopeBlocksApi.update(blockId, { title });
    await fetchData();
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      await scopeBlocksApi.importText({ trackId, text: importText });
      setImportText('');
      setShowImport(false);
      await fetchData();
    } catch {}
    setImporting(false);
  };

  const handleFileUpload = async (blockId: string, file: File) => {
    setUploadingFor(blockId);
    try {
      await scopeBlocksApi.uploadAttachment(blockId, file);
      await fetchData();
    } catch {}
    setUploadingFor(null);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await scopeBlocksApi.deleteAttachment(attachmentId);
      await fetchData();
    } catch {}
  };

  const handleAddUpdate = async (blockId: string) => {
    const text = newUpdateText[blockId]?.trim();
    if (!text) return;
    setSendingUpdate(blockId);
    try {
      await scopeBlocksApi.addUpdate(blockId, text);
      setNewUpdateText((prev) => ({ ...prev, [blockId]: '' }));
      await fetchData();
    } catch {}
    setSendingUpdate(null);
  };

  const handleDeleteUpdate = async (updateId: string) => {
    try {
      await scopeBlocksApi.deleteUpdate(updateId);
      await fetchData();
    } catch {}
  };

  // Filter blocks by search (code, title, attachment names, update text)
  const filterBlocks = (items: ScopeBlock[]): ScopeBlock[] => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((b) => {
      const textMatch = b.title.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || b.content?.toLowerCase().includes(q);
      const attachmentMatch = b.attachments?.some((a) => a.fileName.toLowerCase().includes(q));
      const updateMatch = b.updates?.some((u) => u.content.toLowerCase().includes(q));
      const childMatches = b.children ? filterBlocks(b.children).length > 0 : false;
      return textMatch || attachmentMatch || updateMatch || childMatches;
    }).map((b) => ({
      ...b,
      children: b.children ? filterBlocks(b.children) : [],
    }));
  };

  const filteredBlocks = filterBlocks(blocks);

  const renderBlock = (block: ScopeBlock, depth: number = 0) => {
    const isExpanded = expandedIds.has(block.id);
    const isDetailOpen = detailOpenIds.has(block.id);
    const hasChildren = block.children && block.children.length > 0;
    const progressColor = block.progress >= 100 ? '#10b981' : block.progress > 50 ? trackColor : block.progress > 0 ? '#f59e0b' : '#6b7280';
    const attachments = block.attachments || [];
    const updates = block.updates || [];

    return (
      <div key={block.id} className={cn('border-r-2 transition-colors', depth > 0 && 'mr-4')} style={{ borderColor: `${trackColor}30` }}>
        <div className="glass-hover rounded-xl border border-white/5 mb-2 overflow-hidden">
          {/* Block Header */}
          <div className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => hasChildren ? toggleExpand(block.id) : toggleDetail(block.id)}>
            {/* Expand Icon */}
            <div className="w-5 shrink-0">
              {hasChildren ? (
                isExpanded
                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                  : <ChevronLeft className="w-4 h-4 text-gray-400" />
              ) : (
                <div
                  className="w-4 h-4 flex items-center justify-center text-gray-500 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); toggleDetail(block.id); }}
                >
                  {isDetailOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </div>
              )}
            </div>

            {/* Code Badge */}
            <span
              className="shrink-0 px-2 py-0.5 rounded-md text-xs font-mono font-bold"
              style={{ backgroundColor: `${trackColor}20`, color: trackColor }}
            >
              {block.code}
            </span>

            {/* Title */}
            <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
              {canEdit ? (
                <InlineEdit
                  value={block.title}
                  onSave={(val) => handleTitleUpdate(block.id, val)}
                  className="text-sm font-medium"
                  canEdit={canEdit}
                />
              ) : (
                <span className="text-sm font-medium">{block.title}</span>
              )}
            </div>

            {/* Counts */}
            <div className="flex items-center gap-1.5 shrink-0">
              {attachments.length > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-gray-500">
                  <Paperclip className="w-3 h-3" />
                  {attachments.length}
                </span>
              )}
              {updates.length > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-gray-500">
                  <MessageSquare className="w-3 h-3" />
                  {updates.length}
                </span>
              )}
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-xs px-2 py-0.5 rounded-full', SCOPE_STATUS_COLORS[block.status] || 'bg-gray-500/20 text-gray-300')}>
                {SCOPE_STATUS_LABELS[block.status] || block.status}
              </span>
              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${block.progress}%`, backgroundColor: progressColor }} />
              </div>
              <span className="text-xs font-mono text-gray-400 w-10 text-left">{Math.round(block.progress)}%</span>
            </div>
          </div>

          {/* Detail Panel (content + progress + attachments + updates) */}
          {(isExpanded || isDetailOpen) && (
            <div className="border-t border-white/5 p-3.5 space-y-4">
              {/* Content */}
              {block.content && (
                <p className="text-sm text-gray-400 leading-relaxed">{block.content}</p>
              )}

              {/* Progress Slider */}
              {canEdit && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">التقدم:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={block.progress}
                    onChange={(e) => handleProgressUpdate(block.id, parseInt(e.target.value))}
                    className="flex-1 h-1.5 accent-brand-500 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 font-mono w-10">{Math.round(block.progress)}%</span>
                </div>
              )}

              {/* Attachments Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    المرفقات ({attachments.length})
                  </span>
                  {canEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFileBlockId(block.id);
                        fileInputRef.current?.click();
                      }}
                      disabled={uploadingFor === block.id}
                      className="text-xs px-2 py-1 rounded-lg bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      {uploadingFor === block.id ? 'جاري الرفع...' : 'رفع ملف'}
                    </button>
                  )}
                </div>
                {attachments.length > 0 && (
                  <div className="space-y-1.5">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 group">
                        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300 truncate">{att.fileName}</p>
                          <p className="text-[10px] text-gray-500">
                            {att.uploadedBy?.nameAr || att.uploadedBy?.name} · {formatFileSize(att.fileSize)} · {timeAgo(att.createdAt)}
                          </p>
                        </div>
                        <a
                          href={`${API_URL}${att.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-blue-400 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        {canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(att.id); }}
                            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Updates Section */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  التحديثات ({updates.length})
                </span>

                {/* Add update input */}
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="أضف تحديث..."
                      value={newUpdateText[block.id] || ''}
                      onChange={(e) => setNewUpdateText((prev) => ({ ...prev, [block.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddUpdate(block.id); }}
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-brand-500/50 focus:outline-none"
                      dir="rtl"
                    />
                    <button
                      onClick={() => handleAddUpdate(block.id)}
                      disabled={sendingUpdate === block.id || !newUpdateText[block.id]?.trim()}
                      className="p-1.5 rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {updates.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {updates.map((upd) => (
                      <div key={upd.id} className="flex gap-2 p-2 rounded-lg bg-white/5 group">
                        <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: `${trackColor}60` }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300">{upd.content}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {upd.createdBy?.nameAr || upd.createdBy?.name} · {timeAgo(upd.createdAt)}
                          </p>
                        </div>
                        {user?.role === 'admin' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteUpdate(upd.id); }}
                            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mr-2">
            {block.children!.map((child) => renderBlock(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeFileBlockId) {
            handleFileUpload(activeFileBlockId, file);
          }
          e.target.value = '';
        }}
      />

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass rounded-xl p-3 text-center">
            <p className="text-lg font-bold" style={{ color: trackColor }}>{stats.total || 0}</p>
            <p className="text-xs text-gray-400">إجمالي البنود</p>
          </div>
          <div className="glass rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-emerald-300">{formatPercent(stats.averageProgress || 0)}</p>
            <p className="text-xs text-gray-400">متوسط التقدم</p>
          </div>
          <div className="glass rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-amber-300">{stats.byStatus?.completed || 0}</p>
            <p className="text-xs text-gray-400">مكتمل</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="بحث في نطاق العمل، المرفقات، التحديثات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <button onClick={expandAll} className="px-3 py-2 rounded-xl text-xs text-gray-400 hover:bg-white/5 transition-colors">توسيع الكل</button>
        <button onClick={collapseAll} className="px-3 py-2 rounded-xl text-xs text-gray-400 hover:bg-white/5 transition-colors">طي الكل</button>
        {canEdit && (
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            استيراد نص
          </button>
        )}
      </div>

      {/* Import Panel */}
      {showImport && (
        <div className="glass rounded-xl border border-brand-500/30 p-4 space-y-3">
          <p className="text-sm text-gray-300">الصق النص المنظم (بتنسيق 1.7، 1.7.1 إلخ) لتحويله تلقائيا لبنود نطاق العمل:</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder="1.7 العنوان الرئيسي&#10;المحتوى هنا...&#10;1.7.1 العنوان الفرعي&#10;المحتوى الفرعي..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-brand-500/50 focus:outline-none font-mono"
            dir="rtl"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowImport(false)} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:bg-white/5 transition-colors">إلغاء</button>
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="px-4 py-2 rounded-xl text-sm bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-colors disabled:opacity-50"
            >
              {importing ? 'جاري الاستيراد...' : 'استيراد'}
            </button>
          </div>
        </div>
      )}

      {/* Blocks Tree */}
      {filteredBlocks.length > 0 ? (
        <div className="space-y-1">
          {filteredBlocks.map((block) => renderBlock(block))}
        </div>
      ) : (
        <div className="glass rounded-2xl border border-white/10 p-12 text-center">
          <Layers className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">لا توجد بنود نطاق عمل</p>
          {canEdit && (
            <p className="text-xs text-gray-500 mt-1">استخدم زر &quot;استيراد نص&quot; لإضافة بنود من نص منظم</p>
          )}
        </div>
      )}
    </div>
  );
}
