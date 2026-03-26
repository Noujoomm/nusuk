'use client';

import { create } from 'zustand';
import { tasksApi } from '@/lib/api';

export interface Task {
  id: string;
  title: string;
  titleAr: string;
  description?: string;
  descriptionAr?: string;
  status: string;
  priority: string;
  trackId?: string;
  scopeBlockId?: string;
  startDate?: string;
  dueDate?: string;
  progress: number;
  weight?: number;
  completionDate?: string;
  notes?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDirective?: boolean;

  // Polymorphic assignment
  assigneeType: 'TRACK' | 'USER' | 'HR' | 'GLOBAL';
  assigneeTrackId?: string;
  assigneeUserId?: string;

  track?: { id: string; nameAr: string; color: string };
  scopeBlock?: { id: string; code: string; title: string; trackId?: string };
  createdBy?: { id: string; name: string; nameAr: string };
  assigneeTrack?: { id: string; nameAr: string; color: string };
  assigneeUser?: { id: string; name: string; nameAr: string };
  assignments?: Array<{
    id: string;
    userId: string;
    user: { id: string; name: string; nameAr: string };
  }>;
  files?: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    filePath: string;
    notes?: string;
    uploadedById: string;
    uploadedBy?: { id: string; name: string; nameAr: string };
    createdAt: string;
  }>;
  checklist?: Array<{
    id: string;
    title: string;
    titleAr?: string;
    status: string;
    sortOrder: number;
    notes?: string;
    createdBy?: { id: string; name: string; nameAr: string };
    createdAt: string;
    updatedAt: string;
  }>;
  adminNotes?: Array<{
    id: string;
    content: string;
    authorId: string;
    author?: { id: string; name: string; nameAr: string };
    editHistory?: any[];
    createdAt: string;
    updatedAt: string;
  }>;
  taskUpdates?: Array<{
    id: string;
    content: string;
    authorId: string;
    author?: { id: string; name: string; nameAr: string };
    attachments?: any[];
    createdAt: string;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    beforeJson?: any;
    afterJson?: any;
    actorUserId: string;
    actor?: { id: string; name: string; nameAr: string };
    createdAt: string;
  }>;
  _count?: {
    checklist?: number;
    adminNotes?: number;
    taskUpdates?: number;
    files?: number;
  };
}

interface TasksState {
  tasks: Task[];
  myTasks: Task[];
  total: number;
  loading: boolean;
  stats: any;
  statsLoading: boolean;

  fetchTasks: (params?: any) => Promise<void>;
  fetchMyTasks: (params?: any) => Promise<void>;
  fetchStats: (params?: any) => Promise<void>;
  createTask: (data: any) => Promise<Task>;
  updateTask: (id: string, data: any) => Promise<void>;
  updateTaskStatus: (id: string, status: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  myTasks: [],
  total: 0,
  loading: false,
  stats: null,
  statsLoading: false,

  fetchTasks: async (params?: any) => {
    set({ loading: true });
    try {
      const { data } = await tasksApi.list(params);
      set({ tasks: data.data || [], total: data.total || 0, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchMyTasks: async (params?: any) => {
    set({ loading: true });
    try {
      const { data } = await tasksApi.myTasks(params);
      set({ myTasks: data.data || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStats: async (params?: any) => {
    set({ statsLoading: true });
    try {
      const { data } = await tasksApi.stats(params);
      set({ stats: data, statsLoading: false });
    } catch {
      set({ statsLoading: false });
    }
  },

  createTask: async (data: any) => {
    const { data: task } = await tasksApi.create(data);
    get().fetchTasks();
    return task;
  },

  updateTask: async (id: string, data: any) => {
    await tasksApi.update(id, data);
    get().fetchTasks();
  },

  updateTaskStatus: async (id: string, status: string) => {
    await tasksApi.updateStatus(id, status);
    get().fetchTasks();
    get().fetchMyTasks();
  },

  deleteTask: async (id: string) => {
    await tasksApi.delete(id);
    get().fetchTasks();
  },
}));
