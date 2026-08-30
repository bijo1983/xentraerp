'use client';

import { LogOut, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';

export function Header() {
  const { user, logout } = useAuthStore();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold">Custom ERP</h1>
      <div className="flex items-center gap-4">
        {user && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" />
              <span>{user.full_name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
