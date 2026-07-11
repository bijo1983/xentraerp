'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { useERPStore } from '@/store/erp-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { TenantTheme } from '@/components/tenant/tenant-theme';
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
      <TenantTheme />
      <Sidebar />
      <div className={cn('flex min-h-screen flex-col transition-all duration-300', sidebarOpen ? 'ml-64' : 'ml-16')}>
        <Header />
        {/* flex-1 lets short pages fill the viewport and long pages grow;
            the footer below always sits after the content, never over it. */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-10 sm:p-6 lg:p-8">{children}</main>
        <footer className="border-t bg-background px-6 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} XentraERP · Powered by a modern SaaS ERP platform
        </footer>
      </div>
    </div>
  );
}
