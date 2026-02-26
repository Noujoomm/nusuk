'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/stores/auth';
import { cn, ROLE_LABELS } from '@/lib/utils';
import { dailyUpdatesApi } from '@/lib/api';
import {
  LayoutDashboard,
  GitBranch,
  Users,
  LogOut,
  Shield,
  Target,
  AlertTriangle,
  FileText,
  FolderOpen,
  UserCheck,
  CheckSquare,
  Brain,
  TrendingUp,
  Activity,
  Upload,
  Search,
  Sparkles,
} from 'lucide-react';
import NotificationBell from '@/components/notifications/notification-bell';

const NAV_ITEMS = [
  { href: '/', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['admin', 'pm', 'track_lead', 'employee', 'hr'] },
  { href: '/tracks', label: 'المسارات', icon: GitBranch, roles: ['admin', 'pm', 'track_lead', 'employee'] },
  { href: '/kpis', label: 'مؤشرات الأداء', icon: Target, roles: ['admin', 'pm', 'track_lead'] },
  { href: '/tasks', label: 'المهام', icon: CheckSquare, roles: ['admin', 'pm', 'track_lead', 'employee'] },
  { href: '/achievements-progress', label: 'التقدم والإنجازات', icon: TrendingUp, roles: ['admin', 'pm', 'track_lead', 'employee'] },
  { href: '/reports', label: 'التقارير', icon: FileText, roles: ['admin', 'pm', 'track_lead'] },
  { href: '/ai-reports', label: 'التقارير الذكية', icon: Brain, roles: ['admin', 'pm'] },
  { href: '/penalties', label: 'الغرامات', icon: AlertTriangle, roles: ['admin', 'pm'] },
  { href: '/employees', label: 'الموظفون', icon: UserCheck, roles: ['admin', 'pm', 'hr'] },
  { href: '/files', label: 'الملفات', icon: FolderOpen, roles: ['admin', 'pm', 'track_lead'] },
  { href: '/search', label: 'البحث الذكي', icon: Search, roles: ['admin', 'pm', 'track_lead', 'employee', 'hr'] },
  { href: '/ai-analyze', label: 'تحليل الملفات AI', icon: Sparkles, roles: ['admin', 'pm'] },
  { href: '/import', label: 'استيراد البيانات', icon: Upload, roles: ['admin', 'pm', 'hr'] },
  { href: '/updates', label: 'التحديثات', icon: Activity, roles: ['admin', 'pm', 'track_lead', 'employee', 'hr'] },
  { href: '/users', label: 'المستخدمين', icon: Users, roles: ['admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [unreadUpdates, setUnreadUpdates] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = () => {
      dailyUpdatesApi.unreadCount().then(({ data }) => setUnreadUpdates(data.unreadCount || 0)).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <aside className="fixed right-0 top-0 w-64 h-screen glass border-l border-white/10 flex flex-col z-40">
      {/* Header */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">نسك</h1>
              <p className="text-xs text-gray-500">إدارة المشاريع</p>
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {NAV_ITEMS.filter((item) => user && item.roles.includes(user.role)).map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-brand-500/20 text-brand-300'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white',
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              {item.href === '/updates' && unreadUpdates > 0 && (
                <span className="mr-auto bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadUpdates > 99 ? '99+' : unreadUpdates}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold">
            {user?.nameAr?.charAt(0) || user?.name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.nameAr || user?.name}</p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
