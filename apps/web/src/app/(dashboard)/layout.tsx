'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/stores/auth';
import Sidebar from '@/components/sidebar';
import GlobalSearch from '@/components/global-search';
import BottomDock from '@/components/ui/bottom-dock';
import ThemeToggle from '@/components/theme-toggle';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, loadUser } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      useAuth.setState({ loading: false });
    }, 10000);
    loadUser().finally(() => clearTimeout(timeout));
  }, [loadUser]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-gray-950">
      <Sidebar />
      <main className="flex-1 mr-64 p-6 pb-20 overflow-auto">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>
        {children}
      </main>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <BottomDock />
    </div>
  );
}
