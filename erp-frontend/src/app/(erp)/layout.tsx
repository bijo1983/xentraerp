'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { useERPStore } from '@/store/erp-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useTenantCode } from '@/lib/tenant';

export default function ERPLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tenantCode = useTenantCode();
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

  // Bare unprefixed URLs (e.g. /dashboard, /leads — a manual visit or old
  // bookmark) are never a valid landing spot: every ERP page must live
  // under a tenant code. Redirect to the sandbox/default context's copy
  // of the same page rather than silently rendering it unprefixed.
  useEffect(() => {
    if (!loading && user && !tenantCode) {
      router.replace(`/sandbox${pathname}`);
    }
  }, [loading, user, tenantCode, pathname, router]);

  if (loading || (user && !tenantCode)) {
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
      <div className={cn('transition-all duration-300', sidebarOpen ? 'ml-56' : 'ml-14')}>
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
