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
};

// ─── Records ───
export const recordsApi = {
  listByTrack: (trackId: string, params?: any) =>
    api.get(`/records/track/${trackId}`, { params }),
  stats: (trackId: string) => api.get(`/records/track/${trackId}/stats`),
  get: (id: string) => api.get(`/records/${id}`),
  create: (data: any) => api.post('/records', data),
  update: (id: string, data: any) => api.patch(`/records/${id}`, data),
  delete: (id: string) => api.delete(`/records/${id}`),
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

// ─── Subtasks & Checklists ───
export const subtasksApi = {
  listByRecord: (recordId: string) => api.get(`/subtasks/record/${recordId}`),
  create: (data: any) => api.post('/subtasks', data),
  update: (id: string, data: any) => api.patch(`/subtasks/${id}`, data),
  delete: (id: string) => api.delete(`/subtasks/${id}`),
  getChecklist: (recordId: string) => api.get(`/subtasks/${recordId}/checklist`),
  createChecklistItem: (data: any) => api.post('/subtasks/checklist', data),
  updateChecklistItem: (id: string, data: any) => api.patch(`/subtasks/checklist/${id}`, data),
  deleteChecklistItem: (id: string) => api.delete(`/subtasks/checklist/${id}`),
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
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/tasks/${id}/status`, { status }),
  assign: (id: string, userIds: string[]) => api.post(`/tasks/${id}/assign`, { userIds }),
  delete: (id: string) => api.delete(`/tasks/${id}`),
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
