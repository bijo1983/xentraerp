'use client';

import { useState } from 'react';
import { KeyRound, LogOut, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { ChangePasswordDialog } from './change-password-dialog';

export function Header() {
  const { user, logout } = useAuthStore();
  const [changing, setChanging] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur-md">
      <h1 className="text-[15px] font-semibold tracking-tight">XentraERP</h1>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="flex items-center gap-2 rounded-full border bg-muted/50 py-1 pl-1 pr-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium">{user.full_name}</span>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Change password" aria-label="Change password" onClick={() => setChanging(true)}>
              <KeyRound className="h-4 w-4" />
            </Button>
            <ChangePasswordDialog open={changing} onOpenChange={setChanging} />
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Sign out" aria-label="Sign out" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
