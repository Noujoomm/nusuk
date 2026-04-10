import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh', {});
        localStorage.setItem('access_token', data.accessToken);
        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;

// ─── Auth ───
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; name: string; nameAr: string; trackId: string; role: string }) =>
    api.post('/auth/register', data),
  refresh: () => api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  getPublicTracks: () => api.get('/auth/public-tracks'),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
  validateResetToken: (token: string) =>
    api.get('/auth/validate-reset-token', { params: { token } }),
};

// ─── Users ───
export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),
  setPermissions: (id: string, trackId: string, permissions: string[]) =>
    api.post(`/users/${id}/permissions`, { trackId, permissions }),
  toggleLock: (id: string) => api.patch(`/users/${id}/toggle-lock`),
};

// ─── Tracks ───
export const tracksApi = {
  list: () => api.get('/tracks'),
  get: (id: string) => api.get(`/tracks/${id}`),
  create: (data: any) => api.post('/tracks', data),
  update: (id: string, data: any) => api.patch(`/tracks/${id}`, data),
  delete: (id: string) => api.delete(`/tracks/${id}`),
  // PPTX Import
  pptxExtract: (content: string, trackId: string) =>
    api.post('/tracks/pptx-extract', { content, trackId }, { timeout: 300000, maxBodyLength: 500 * 1024 * 1024, maxContentLength: 500 * 1024 * 1024 }),
  pptxApply: (trackId: string, updates: any[]) =>
    api.post('/tracks/pptx-apply', { trackId, updates }, { timeout: 60000 }),
  // Universal file import (all formats)
  fileExtract: (content: string, trackId: string, fileName: string) =>
    api.post('/tracks/file-extract', { content, trackId, fileName }, { timeout: 300000, maxBodyLength: 500 * 1024 * 1024, maxContentLength: 500 * 1024 * 1024 }),
};

// ─── Progress & Achievements ───
export const progressApi = {
  globalStats: () => api.get('/progress/global-stats'),
  trackProgress: (trackId: string) => api.get(`/progress/track/${trackId}`),
  employeeProgress: (employeeId: string) => api.get(`/progress/employee/${employeeId}`),
  getItem: (entityType: string, entityId: string) => api.get(`/progress/${entityType}/${entityId}`),
  updateProgress: (entityType: string, entityId: string, data: any) => api.patch(`/progress/${entityType}/${entityId}`, data),
  byType: (entityType: string) => api.get(`/progress/by-type/${entityType}`),
  events: (entityType: string, entityId: string) => api.get(`/progress/events/${entityType}/${entityId}`),
};

export const achievementsApi = {
  list: (params?: any) => api.get('/progress/achievements', { params }),
  create: (data: any) => api.post('/progress/achievements', data),
  update: (id: string, data: any) => api.patch(`/progress/achievements/${id}`, data),
  delete: (id: string) => api.delete(`/progress/achievements/${id}`),
};

// ─── Scope Blocks ───
export const scopeBlocksApi = {
  byTrack: (trackId: string) => api.get(`/scope-blocks/track/${trackId}`),
  stats: (trackId: string) => api.get(`/scope-blocks/track/${trackId}/stats`),
  get: (id: string) => api.get(`/scope-blocks/${id}`),
  create: (data: any) => api.post('/scope-blocks', data),
  update: (id: string, data: any) => api.patch(`/scope-blocks/${id}`, data),
  updateProgress: (id: string, data: any) => api.patch(`/scope-blocks/${id}/progress`, data),
  delete: (id: string) => api.delete(`/scope-blocks/${id}`),
  importText: (data: { trackId: string; text: string }) => api.post('/scope-blocks/import', data),
  reorder: (blocks: Array<{ id: string; orderIndex: number }>) => api.patch('/scope-blocks/reorder', { blocks }),
  // Attachments
  getAttachments: (blockId: string) => api.get(`/scope-blocks/${blockId}/attachments`),
  uploadAttachment: (blockId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/scope-blocks/${blockId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteAttachment: (attachmentId: string) => api.delete(`/scope-blocks/attachments/${attachmentId}`),
  // Updates (timeline)
  getUpdates: (blockId: string) => api.get(`/scope-blocks/${blockId}/updates`),
  addUpdate: (blockId: string, content: string) => api.post(`/scope-blocks/${blockId}/updates`, { content }),
  deleteUpdate: (updateId: string) => api.delete(`/scope-blocks/updates/${updateId}`),
};

// ─── Employees ───
export const employeesApi = {
  list: (params?: any) => api.get('/tracks/employees', { params }),
  create: (data: any) => api.post('/tracks/employees', data),
  update: (id: string, data: any) => api.patch(`/tracks/employees/${id}`, data),
  delete: (id: string) => api.delete(`/tracks/employees/${id}`),
  restore: (id: string) => api.patch(`/tracks/employees/${id}/restore`),
  bulkDelete: (ids: string[]) => api.post('/tracks/employees/bulk-delete', { ids }),
};

// ─── Penalties ───
export const penaltiesApi = {
  list: (params?: any) => api.get('/tracks/penalties', { params }),
  create: (data: any) => api.post('/tracks/penalties', data),
  update: (id: string, data: any) => api.patch(`/tracks/penalties/${id}`, data),
  delete: (id: string) => api.delete(`/tracks/penalties/${id}`),
};

// ─── Deliverables ───
export const deliverablesApi = {
  create: (data: any) => api.post('/tracks/deliverables', data),
  update: (id: string, data: any) => api.patch(`/tracks/deliverables/${id}`, data),
  delete: (id: string) => api.delete(`/tracks/deliverables/${id}`),
  restore: (id: string) => api.patch(`/tracks/deliverables/${id}/restore`),
};

// ─── Scopes ───
export const scopesApi = {
  create: (data: any) => api.post('/tracks/scopes', data),
  update: (id: string, data: any) => api.patch(`/tracks/scopes/${id}`, data),
  delete: (id: string) => api.delete(`/tracks/scopes/${id}`),
  restore: (id: string) => api.patch(`/tracks/scopes/${id}/restore`),
};

// ─── Track KPIs ───
export const trackKpisApi = {
  create: (data: any) => api.post('/tracks/track-kpis', data),
  update: (id: string, data: any) => api.patch(`/tracks/track-kpis/${id}`, data),
  delete: (id: string) => api.delete(`/tracks/track-kpis/${id}`),
  restore: (id: string) => api.patch(`/tracks/track-kpis/${id}/restore`),
};

// ─── KPIs ───
export const kpisApi = {
  list: (params?: any) => api.get('/kpis', { params }),
  stats: (trackId?: string) => api.get('/kpis/stats', { params: { trackId } }),
  get: (id: string) => api.get(`/kpis/${id}`),
  create: (data: any) => api.post('/kpis', data),
  update: (id: string, data: any) => api.patch(`/kpis/${id}`, data),
  delete: (id: string) => api.delete(`/kpis/${id}`),
};

// ─── Reports ───
export const reportsApi = {
  list: (params?: any) => api.get('/reports', { params }),
  stats: () => api.get('/reports/stats'),
  get: (id: string) => api.get(`/reports/${id}`),
  create: (data: any) => api.post('/reports', data),
  update: (id: string, data: any) => api.patch(`/reports/${id}`, data),
  delete: (id: string) => api.delete(`/reports/${id}`),
  // Attachments
  addAttachments: (reportId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return api.post(`/reports/${reportId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    });
  },
  deleteAttachment: (attachmentId: string) => api.delete(`/reports/attachments/${attachmentId}`),
  downloadAttachment: (attachmentId: string) =>
    api.get(`/reports/attachments/${attachmentId}/download`, { responseType: 'blob' }),
};

// ─── Files ───
export const filesApi = {
  list: (params?: any) => api.get('/files', { params }),
  stats: () => api.get('/files/stats'),
  upload: (file: File, data?: any) => {
    const form = new FormData();
    form.append('file', file);
    if (data?.trackId) form.append('trackId', data.trackId);
    if (data?.category) form.append('category', data.category);
    if (data?.notes) form.append('notes', data.notes);
    return api.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  register: (data: any) => api.post('/files/register', data),
  analyze: (file: File, analysisType?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (analysisType) form.append('analysisType', analysisType);
    return api.post('/files/analyze', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  download: (id: string) => api.get(`/files/${id}/download`, { responseType: 'blob' }),
  updateStatus: (id: string, status: string) => api.patch(`/files/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/files/${id}`),
};

// ─── AI Insights ───
export const insightsApi = {
  executive: () => api.get('/insights/executive'),
  track: (trackId: string) => api.get(`/insights/track/${trackId}`),
};

// ─── Daily Updates ───
export const dailyUpdatesApi = {
  list: (params?: any) => api.get('/daily-updates', { params }),
  get: (id: string) => api.get(`/daily-updates/${id}`),
  create: (data: any, files?: File[]) => {
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, String(value));
      }
    });
    if (files) {
      files.forEach((file) => form.append('files', file));
    }
    return api.post('/daily-updates', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  update: (id: string, data: any) => api.patch(`/daily-updates/${id}`, data),
  delete: (id: string) => api.delete(`/daily-updates/${id}`),
  togglePin: (id: string) => api.patch(`/daily-updates/${id}/pin`),
  markAsRead: (id: string) => api.post(`/daily-updates/${id}/read`),
  markAllAsRead: () => api.post('/daily-updates/read-all'),
  unreadCount: () => api.get('/daily-updates/unread-count'),
  addAttachments: (updateId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return api.post(`/daily-updates/${updateId}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteAttachment: (attachmentId: string) => api.delete(`/daily-updates/attachments/${attachmentId}`),
  downloadAttachment: (attachmentId: string) =>
    api.get(`/daily-updates/attachments/${attachmentId}/download`, { responseType: 'blob' }),
};

// ─── Audit ───
export const auditApi = {
  list: (params?: any) => api.get('/audit', { params }),
};

// ─── Comments ───
export const commentsApi = {
  list: (entityType: string, entityId: string, params?: any) =>
    api.get(`/comments/${entityType}/${entityId}`, { params }),
  count: (entityType: string, entityId: string) =>
    api.get(`/comments/${entityType}/${entityId}/count`),
  create: (data: any) => api.post('/comments', data),
  update: (id: string, data: any) => api.patch(`/comments/${id}`, data),
  delete: (id: string) => api.delete(`/comments/${id}`),
};

// ─── Notifications ───
export const notificationsApi = {
  list: (params?: any) => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data: any) => api.patch('/notifications/preferences', data),
};

// ─── Tasks ───
export const tasksApi = {
  list: (params?: any) => api.get('/tasks', { params }),
  myTasks: (params?: any) => api.get('/tasks/my', { params }),
  byTrack: (trackId: string, params?: any) => api.get(`/tasks/track/${trackId}`, { params }),
  stats: (params?: any) => api.get('/tasks/stats', { params }),
  executiveStats: () => api.get('/tasks/executive/stats'),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/tasks/${id}/status`, { status }),
  assign: (id: string, userIds: string[]) => api.post(`/tasks/${id}/assign`, { userIds }),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  auditLog: (id: string, params?: any) => api.get(`/tasks/${id}/audit`, { params }),
  // Checklist
  getChecklist: (id: string) => api.get(`/tasks/${id}/checklist`),
  createChecklistItem: (id: string, data: any) => api.post(`/tasks/${id}/checklist`, data),
  updateChecklistItem: (id: string, itemId: string, data: any) => api.patch(`/tasks/${id}/checklist/${itemId}`, data),
  deleteChecklistItem: (id: string, itemId: string) => api.delete(`/tasks/${id}/checklist/${itemId}`),
  // Admin Notes
  getAdminNotes: (id: string) => api.get(`/tasks/${id}/admin-notes`),
  createAdminNote: (id: string, data: any) => api.post(`/tasks/${id}/admin-notes`, data),
  updateAdminNote: (id: string, noteId: string, data: any) => api.patch(`/tasks/${id}/admin-notes/${noteId}`, data),
  deleteAdminNote: (id: string, noteId: string) => api.delete(`/tasks/${id}/admin-notes/${noteId}`),
  // Task Updates
  getTaskUpdates: (id: string, params?: any) => api.get(`/tasks/${id}/updates`, { params }),
  createTaskUpdate: (id: string, data: any) => api.post(`/tasks/${id}/updates`, data),
  deleteTaskUpdate: (id: string, updateId: string) => api.delete(`/tasks/${id}/updates/${updateId}`),
  // Task Files
  getTaskFiles: (id: string) => api.get(`/tasks/${id}/files`),
  uploadTaskFile: (id: string, file: File, notes?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (notes) formData.append('notes', notes);
    return api.post(`/tasks/${id}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteTaskFile: (id: string, fileId: string) => api.delete(`/tasks/${id}/files/${fileId}`),
  downloadTaskFile: (id: string, fileId: string) =>
    api.get(`/tasks/${id}/files/${fileId}/download`, { responseType: 'blob' }),
  trackProgress: (trackId: string) => api.get(`/tasks/track/${trackId}/progress`),
};

// ─── AI ───
export const aiApi = {
  generateReport: (data: any) => api.post('/ai/reports/generate', data),
  listReports: (params?: any) => api.get('/ai/reports', { params }),
  getReport: (id: string) => api.get(`/ai/reports/${id}`),
  downloadExcel: (id: string) => api.get(`/ai/reports/${id}/excel`, { responseType: 'blob' }),
  deleteReport: (id: string) => api.delete(`/ai/reports/${id}`),
  semanticSearch: (q: string, params?: any) => api.get('/search/semantic', { params: { q, ...params } }),
  analyzeTrack: (trackId: string) => api.get(`/ai/analysis/track/${trackId}`),
  analyzeKPIs: () => api.get('/ai/analysis/kpis'),
  indexAll: () => api.post('/ai/embeddings/index-all'),
  embeddingStats: () => api.get('/ai/embeddings/stats'),
};

// ─── Imports ───
export const importsApi = {
  getFields: (entityType: string) => api.get('/imports/fields', { params: { entityType } }),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/imports/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  parseSheet: (filePath: string, sheetName: string) => api.post('/imports/parse-sheet', { filePath, sheetName }),
  execute: (data: any) => api.post('/imports/execute', data),
  history: (params?: any) => api.get('/imports/history', { params }),
};

// ─── Search ───
export const searchApi = {
  search: (q: string, params?: any) => api.get('/search', { params: { q, ...params } }),
};

// ─── Gantt / Timeline ───
export const ganttApi = {
  // Tasks
  tasks: (params?: any) => api.get('/gantt/tasks', { params }),
  task: (id: string) => api.get(`/gantt/tasks/${id}`),
  createTask: (data: any) => api.post('/gantt/tasks', data),
  updateTask: (id: string, data: any) => api.patch(`/gantt/tasks/${id}`, data),
  bulkUpdate: (tasks: any[]) => api.post('/gantt/tasks/bulk-update', { tasks }),
  deleteTask: (id: string) => api.delete(`/gantt/tasks/${id}`),
  deleteInfo: (id: string) => api.get(`/gantt/tasks/${id}/delete-info`),
  undoDelete: (id: string) => api.post(`/gantt/tasks/${id}/undo-delete`),
  // Auto-schedule
  autoSchedule: (trackId: string) => api.post(`/gantt/auto-schedule/${trackId}`),
  // Dependencies
  dependencies: (taskId: string) => api.get(`/gantt/dependencies/${taskId}`),
  createDependency: (data: any) => api.post('/gantt/dependencies', data),
  updateDependency: (id: string, data: any) => api.patch(`/gantt/dependencies/${id}`, data),
  deleteDependency: (id: string) => api.delete(`/gantt/dependencies/${id}`),
  // Calendars
  calendars: () => api.get('/gantt/calendars'),
  createCalendar: (data: any) => api.post('/gantt/calendars', data),
  updateCalendar: (id: string, data: any) => api.patch(`/gantt/calendars/${id}`, data),
  deleteCalendar: (id: string) => api.delete(`/gantt/calendars/${id}`),
  // Resources
  createResource: (data: any) => api.post('/gantt/resources', data),
  deleteResource: (id: string) => api.delete(`/gantt/resources/${id}`),
  resourceLoad: (userId: string, params?: any) => api.get(`/gantt/resource-load/${userId}`, { params }),
  // Baseline
  setBaseline: (data?: any, trackId?: string) => api.post('/gantt/baseline', data || {}, { params: { trackId } }),
  // Stats
  stats: (trackId?: string) => api.get('/gantt/stats', { params: { trackId } }),
  // Export/Import
  exportXML: (trackId?: string) => api.get('/gantt/export/msproject.xml', { params: { trackId }, responseType: 'blob', timeout: 120000 }),
  exportCSV: (trackId?: string) => api.get('/gantt/export/csv', { params: { trackId }, responseType: 'blob', timeout: 120000 }),
  importXML: (xmlContent: string, trackId: string) => api.post('/gantt/import/msproject', { xmlContent, trackId }, { timeout: 300000, maxBodyLength: 500 * 1024 * 1024, maxContentLength: 500 * 1024 * 1024 }),
  smartImport: (content: string, trackId: string, format?: string) => api.post('/gantt/import', { content, trackId, format }, { timeout: 300000, maxBodyLength: 500 * 1024 * 1024, maxContentLength: 500 * 1024 * 1024 }),
};

// ─── Executive Tasks (المهام التنفيذية) ───
export const executiveTasksApi = {
  list: (params?: any) => api.get('/executive-tasks', { params }),
  stats: () => api.get('/executive-tasks/stats'),
  sheets: () => api.get('/executive-tasks/sheets'),
  get: (id: string) => api.get(`/executive-tasks/${id}`),
  create: (data: any) => api.post('/executive-tasks', data),
  update: (id: string, data: any) => api.patch(`/executive-tasks/${id}`, data),
  delete: (id: string) => api.delete(`/executive-tasks/${id}`),
  importData: (data: any[], sheetName: string) => api.post('/executive-tasks/import', { data, sheetName }),
};

// ─── Analytics ───
export const analyticsApi = {
  dashboard: () => api.get('/analytics/dashboard'),
  trackPerformance: () => api.get('/analytics/track-performance'),
  trackPerformanceById: (id: string) => api.get(`/analytics/track-performance/${id}`),
};

// ─── Distribution: Achievement + Deviation ───
export const distAchievementApi = {
  dashboard: () => api.get('/distribution/achievement/dashboard'),
  create: (data: any) => api.post('/distribution/achievement', data),
  delete: (id: string) => api.delete(`/distribution/achievement/${id}`),
};
export const distDeviationApi = {
  dashboard: () => api.get('/distribution/deviation/dashboard'),
  create: (data: any) => api.post('/distribution/deviation', data),
  delete: (id: string) => api.delete(`/distribution/deviation/${id}`),
};

// ─── AI Engine ───
export const aiEngineApi = {
  insights: () => api.get('/ai-engine/insights'),
  alerts: () => api.get('/ai-engine/alerts'),
  predictions: () => api.get('/ai-engine/predictions'),
  executive: () => api.get('/ai-engine/executive'),
  ask: (question: string) => api.post('/ai-engine/ask', { question }),
  simulate: (params: any) => api.post('/ai-engine/simulate', params),
  commandCenter: () => api.get('/ai-engine/command-center'),
};



// ─── Productivity Engine ───
export const productivityApi = {
  getProject: () => api.get('/productivity'),
  getTrack: (trackId: string) => api.get(`/productivity/tracks/${trackId}`),
  saveSnapshot: () => api.post('/productivity/snapshot'),
  exportExcel: () => api.get('/productivity/export/excel', { responseType: 'blob' }),
  exportPptx: () => api.get('/productivity/export/pptx', { responseType: 'blob' }),
  exportTrackExcel: (trackId: string) => api.get(`/productivity/export/tracks/${trackId}/excel`, { responseType: 'blob' }),
};

// ─── Support Services (خدمات مساندة) ───
export const supportServicesApi = {
  dashboard: () => api.get('/support-services/dashboard'),
  // Custodies
  listCustodies: (params?: any) => api.get('/support-services/custodies', { params }),
  getCustody: (id: string) => api.get(`/support-services/custodies/${id}`),
  createCustody: (data: any) => api.post('/support-services/custodies', data),
  updateCustody: (id: string, data: any) => api.patch(`/support-services/custodies/${id}`, data),
  deleteCustody: (id: string) => api.delete(`/support-services/custodies/${id}`),
  closeCustody: (id: string, data?: { closingNotes?: string }) => api.post(`/support-services/custodies/${id}/close`, data || {}),
  // Invoices
  listInvoices: (params?: any) => api.get('/support-services/invoices', { params }),
  createInvoice: (data: any) => api.post('/support-services/invoices', data),
  updateInvoiceStatus: (id: string, status: string) => api.patch(`/support-services/invoices/${id}/status`, { status }),
  deleteInvoice: (id: string) => api.delete(`/support-services/invoices/${id}`),
  // Members
  getMembers: (custodyId: string) => api.get(`/support-services/custodies/${custodyId}/members`),
  addMember: (data: { custodyId: string; userId: string; roleType?: string }) => api.post('/support-services/members', data),
  removeMember: (custodyId: string, memberId: string) => api.delete(`/support-services/custodies/${custodyId}/members/${memberId}`),
  // Invoice Attachments
  uploadInvoiceFiles: (invoiceId: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return api.post(`/support-services/invoices/${invoiceId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getInvoiceAttachments: (invoiceId: string) => api.get(`/support-services/invoices/${invoiceId}/attachments`),
  deleteInvoiceAttachment: (invoiceId: string, attachmentId: string) => api.delete(`/support-services/invoices/${invoiceId}/attachments/${attachmentId}`),
  // Balance Transactions
  addBalanceTransaction: (data: any) => api.post('/support-services/balance-transactions', data),
  getBalanceTransactions: (custodyId: string) => api.get(`/support-services/custodies/${custodyId}/balance-transactions`),
  // Custody Items
  getCustodyItems: (custodyId: string) => api.get(`/support-services/custodies/${custodyId}/items`),
  createCustodyItem: (data: any) => api.post('/support-services/custody-items', data),
  updateCustodyItem: (id: string, data: any) => api.patch(`/support-services/custody-items/${id}`, data),
  deleteCustodyItem: (id: string) => api.delete(`/support-services/custody-items/${id}`),
  // Requests
  listRequests: (params?: any) => api.get('/support-services/requests', { params }),
  createRequest: (data: any) => api.post('/support-services/requests', data),
  updateRequest: (id: string, data: any) => api.patch(`/support-services/requests/${id}`, data),
  deleteRequest: (id: string) => api.delete(`/support-services/requests/${id}`),
  // Audit
  getAuditLogs: (custodyId?: string, limit?: number) => api.get('/support-services/audit-logs', { params: { custodyId, limit } }),
};

// ─── Custody Funds v2 ───
export const custodyFundsApi = {
  list: () => api.get('/custody-funds'),
  create: (data: any) => api.post('/custody-funds', data),
  get: (id: string) => api.get(`/custody-funds/${id}`),
  update: (id: string, data: any) => api.patch(`/custody-funds/${id}`, data),
  delete: (id: string) => api.delete(`/custody-funds/${id}`),
  reopen: (id: string, reason: string) => api.patch(`/custody-funds/${id}/reopen`, { reason }),
  getLedger: (id: string, page?: number) => api.get(`/custody-funds/${id}/ledger`, { params: { page } }),
  addTransaction: (id: string, data: any) => api.post(`/custody-funds/${id}/transactions`, data),
  addMember: (id: string, data: any) => api.post(`/custody-funds/${id}/members`, data),
  removeMember: (id: string, mid: string) => api.delete(`/custody-funds/${id}/members/${mid}`),
  addInvoice: (id: string, data: FormData) => api.post(`/custody-funds/${id}/invoices`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  editInvoice: (iid: string, data: any) => api.patch(`/custody-funds/invoices/${iid}`, data),
  updateInvoiceStatus: (iid: string, status: string) => api.patch(`/custody-funds/invoices/${iid}/status`, { status }),
  deleteInvoice: (iid: string) => api.delete(`/custody-funds/invoices/${iid}`),
  close: (id: string, closingNote?: string) => api.patch(`/custody-funds/${id}/close`, { closingNote }),
  dismissAlert: (aid: string) => api.patch(`/custody-funds/alerts/${aid}/dismiss`),
};

// ─── Admin System Export ───
export const adminExportApi = {
  systemStats: () => api.get('/admin/system-stats'),
  fullExport: () => api.get('/admin/full-system-export', { timeout: 120000 }),
  integrityCheck: () => api.get('/admin/integrity-check', { timeout: 60000 }),
  tracksDeep: (trackId?: string) => api.get('/admin/tracks-deep', { params: trackId ? { trackId } : {}, timeout: 120000 }),
  downloadZip: () => api.get('/admin/export-zip', { responseType: 'blob', timeout: 300000 }),
};
