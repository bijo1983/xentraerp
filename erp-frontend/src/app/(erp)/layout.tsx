'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { useERPStore } from '@/store/erp-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';

export default function ERPLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, checkSession } = useAuthStore();
  const { sidebarOpen } = useERPStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar />
      <div className={cn('transition-all duration-300', sidebarOpen ? 'ml-64' : 'ml-16')}>
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
