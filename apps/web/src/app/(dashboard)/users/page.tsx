'use client';

import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/utils';
import { Plus, Trash2, Search, Key, Lock, Unlock, Shield, Clock, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';

interface UserItem {
  id: string;
  email: string;
  name: string;
  nameAr: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  failedLoginAttempts: number;
  isLocked: boolean;
  lockedAt: string | null;
}

function formatTimeAgo(date: string | null): string {
  if (!date) return 'لم يسجل دخول';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  if (diffDay < 30) return `منذ ${diffDay} يوم`;
  return d.toLocaleDateString('ar-SA-u-nu-latn', { month: 'short', day: 'numeric' });
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', nameAr: '', password: '', role: 'employee' });
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    try {
      const { data } = await usersApi.list({ page, pageSize: 25, search: search || undefined });
      setUsers(data.data);
      setTotal(data.total);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [page, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await usersApi.create(form);
      toast.success('تم إنشاء المستخدم');
      setShowCreate(false);
      setForm({ email: '', name: '', nameAr: '', password: '', role: 'employee' });
      loadUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إنشاء المستخدم');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    try {
      await usersApi.delete(id);
      toast.success('تم حذف المستخدم');
      loadUsers();
    } catch {
      toast.error('فشل حذف المستخدم');
    }
  };

  const handleResetPassword = async (id: string) => {
    const password = prompt('أدخل كلمة المرور الجديدة:');
    if (!password || password.length < 6) {
      if (password) toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    try {
      await usersApi.resetPassword(id, password);
      toast.success('تم تغيير كلمة المرور');
    } catch {
      toast.error('فشل تغيير كلمة المرور');
    }
  };

  const handleToggleLock = async (user: UserItem) => {
    const action = user.isLocked ? 'إلغاء قفل' : 'قفل';
    if (!confirm(`هل تريد ${action} حساب "${user.nameAr}"؟`)) return;
    try {
      await usersApi.toggleLock(user.id);
      toast.success(user.isLocked ? 'تم إلغاء قفل الحساب' : 'تم قفل الحساب');
      loadUsers();
    } catch {
      toast.error(`فشل ${action} الحساب`);
    }
  };

  const handleToggleActive = async (user: UserItem) => {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
      loadUsers();
    } catch {
      toast.error('فشل تحديث الحساب');
    }
  };

  // Stats
  const activeCount = users.filter((u) => u.isActive).length;
  const lockedCount = users.filter((u) => u.isLocked).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">المستخدمين</h1>
          <p className="text-gray-400 mt-1">إدارة حسابات المستخدمين والصلاحيات</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          مستخدم جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20"><Shield className="w-5 h-5 text-blue-400" /></div>
            <div><p className="text-lg font-bold">{total}</p><p className="text-xs text-gray-400">إجمالي المستخدمين</p></div>
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20"><LogIn className="w-5 h-5 text-emerald-400" /></div>
            <div><p className="text-lg font-bold">{activeCount}</p><p className="text-xs text-gray-400">حساب نشط</p></div>
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/20"><Lock className="w-5 h-5 text-red-400" /></div>
            <div><p className="text-lg font-bold">{lockedCount}</p><p className="text-xs text-gray-400">حساب مقفل</p></div>
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20"><Clock className="w-5 h-5 text-amber-400" /></div>
            <div>
              <p className="text-lg font-bold">{users.filter((u) => u.lastLoginAt).length}</p>
              <p className="text-xs text-gray-400">سجل دخول</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="بحث بالاسم أو البريد..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input-field pr-10"
        />
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="glass p-5">
          <h3 className="font-semibold mb-4">إنشاء مستخدم جديد</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <input placeholder="البريد الإلكتروني" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" required dir="ltr" />
            <input placeholder="الاسم (EN)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
            <input placeholder="الاسم (AR)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className="input-field" required />
            <input placeholder="كلمة المرور" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" required dir="ltr" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field">
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '...' : 'إنشاء'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right p-4 font-medium text-gray-400">المستخدم</th>
                <th className="text-right p-4 font-medium text-gray-400">البريد</th>
                <th className="text-right p-4 font-medium text-gray-400">الدور</th>
                <th className="text-right p-4 font-medium text-gray-400">الحالة</th>
                <th className="text-right p-4 font-medium text-gray-400">آخر دخول</th>
                <th className="text-right p-4 font-medium text-gray-400">مرات الدخول</th>
                <th className="text-center p-4 font-medium text-gray-400">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <p className="font-medium">{u.nameAr}</p>
                    <p className="text-xs text-gray-500">{u.name}</p>
                  </td>
                  <td className="p-4 text-gray-300" dir="ltr">{u.email}</td>
                  <td className="p-4">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-brand-500/20 text-brand-300">
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit cursor-pointer hover:opacity-80 transition-opacity ${
                          u.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {u.isActive ? 'نشط' : 'معطل'}
                      </button>
                      {u.isLocked && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-400 w-fit flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          مقفل
                        </span>
                      )}
                      {u.failedLoginAttempts > 0 && !u.isLocked && (
                        <span className="text-[10px] text-amber-400">
                          {u.failedLoginAttempts} محاولة خاطئة
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-gray-400 text-xs">
                    {formatTimeAgo(u.lastLoginAt)}
                  </td>
                  <td className="p-4 text-gray-400 text-center">
                    {u.loginCount || 0}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleResetPassword(u.id)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        title="تغيير كلمة المرور"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleLock(u)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          u.isLocked
                            ? 'hover:bg-emerald-500/10 text-red-400 hover:text-emerald-400'
                            : 'hover:bg-amber-500/10 text-gray-400 hover:text-amber-400'
                        }`}
                        title={u.isLocked ? 'إلغاء القفل' : 'قفل الحساب'}
                      >
                        {u.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">لا يوجد مستخدمين</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            السابق
          </button>
          <span className="text-sm text-gray-400">صفحة {page} من {Math.ceil(total / 25)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 25)}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
