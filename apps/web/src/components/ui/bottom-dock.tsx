'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3, GitBranch, CheckSquare, GanttChart, FileText, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCK_ITEMS = [
  { href: '/dashboard', label: 'لوحة القيادة', icon: BarChart3 },
  { href: '/tracks', label: 'المسارات', icon: GitBranch },
  { href: '/tasks', label: 'المهام', icon: CheckSquare },
  { href: '/gantt', label: 'جانت', icon: GanttChart },
  { href: '/reports', label: 'التقارير', icon: FileText },
  { href: '/search', label: 'بحث', icon: Search },
];

export default function BottomDock() {
  const pathname = usePathname();

  // Hide on login/register pages
  if (pathname === '/login' || pathname === '/register' || pathname?.startsWith('/forgot') || pathname?.startsWith('/reset')) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-1 px-2 py-1.5
        bg-slate-900/70 backdrop-blur-xl
        border border-white/[0.08] rounded-2xl
        shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      role="navigation"
      aria-label="الاختصارات السريعة"
    >
      {DOCK_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center justify-center',
              'w-12 h-12 md:w-14 md:h-14 rounded-xl',
              'transition-all duration-200 ease-out group',
              isActive
                ? 'bg-brand-500/20 text-brand-400 scale-105'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]',
            )}
          >
            <item.icon className={cn(
              'w-5 h-5 transition-transform duration-200',
              isActive && 'drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]',
              'group-hover:scale-110',
            )} />
            <span className={cn(
              'text-[8px] mt-0.5 leading-none font-medium',
              isActive ? 'text-brand-400' : 'text-gray-500 group-hover:text-gray-300',
            )}>
              {item.label}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
            )}

            {/* Tooltip on hover (desktop) */}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5
              bg-slate-800 text-[10px] text-gray-200 rounded-lg
              opacity-0 group-hover:opacity-100 transition-opacity duration-150
              pointer-events-none whitespace-nowrap border border-white/[0.06]
              hidden md:block">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
