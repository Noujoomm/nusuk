// ─── Platform Config ───
export const PLATFORM_NAME = 'رؤية';
export const PLATFORM_NAME_EN = 'Ruya';
export const PLATFORM_SUBTITLE = 'نظام إدارة المشاريع';
export const PLATFORM_EXPORT_PREFIX = 'ruya';

// ─── Roles ───
export enum Role {
  Admin = 'admin',
  ProjectManager = 'pm',
  TrackLead = 'track_lead',
  Employee = 'employee',
  HR = 'hr',
}

// ─── Permissions ───
export enum Permission {
  View = 'view',
  Edit = 'edit',
  Create = 'create',
  Delete = 'delete',
  Export = 'export',
}

// ─── Record Status ───
export enum RecordStatus {
  Draft = 'draft',
  Active = 'active',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

// ─── Record Priority ───
export enum RecordPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

// ─── Audit Action ───
export enum AuditAction {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Login = 'login',
  Logout = 'logout',
}

// ─── WebSocket Events ───
export const WS_EVENTS = {
  RECORD_CREATED: 'track.record.created',
  RECORD_UPDATED: 'track.record.updated',
  RECORD_DELETED: 'track.record.deleted',
  JOIN_TRACK: 'track.join',
  LEAVE_TRACK: 'track.leave',
  USER_ONLINE: 'user.online',
  USER_OFFLINE: 'user.offline',
} as const;

// ─── DTOs ───
export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  nameAr: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  trackPermissions: TrackPermissionResponse[];
}

export interface TrackPermissionResponse {
  trackId: string;
  trackName: string;
  trackNameAr: string;
  permissions: Permission[];
}

export interface TrackResponse {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  descriptionAr: string | null;
  color: string;
  isActive: boolean;
  _count?: { records: number };
}

export interface RecordResponse {
  id: string;
  trackId: string;
  title: string;
  titleAr: string | null;
  status: RecordStatus;
  priority: RecordPriority;
  owner: string | null;
  dueDate: string | null;
  progress: number;
  notes: string | null;
  extraFields: Record<string, unknown> | null;
  version: number;
  createdById: string;
  createdBy?: { id: string; name: string; nameAr: string };
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogResponse {
  id: string;
  actionType: AuditAction;
  entityType: string;
  entityId: string | null;
  trackId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; nameAr: string } | null;
  track: { id: string; nameAr: string } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
