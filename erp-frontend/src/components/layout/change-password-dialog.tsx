'use client';

import { useState } from 'react';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/** Pull the server's message out of a Frappe error response (axios). */
function serverMessage(err: unknown): string | null {
  const data = (err as { response?: { data?: { _server_messages?: string; exception?: string } } })?.response?.data;
  try {
    const msgs = JSON.parse(data?._server_messages || '[]') as string[];
    const m = msgs.map((x) => (JSON.parse(x) as { message?: string }).message).filter(Boolean).join(' ');
    if (m) return m.replace(/<[^>]+>/g, '');
  } catch {
    /* fall through */
  }
  const ex = data?.exception?.split(':').slice(1).join(':').trim();
  return ex || null;
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reset = (o: boolean) => {
    if (o) {
      setCurrent(''); setNext(''); setConfirm(''); setError(null); setDone(false);
    }
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError("The two new passwords don't match.");
    if (next === current) return setError('Choose a password different from your current one.');
    setBusy(true);
    try {
      await frappe.call('custom_erp.api.auth.change_password', { new_password: next, current_password: current });
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 401 ? 'Your current password is not correct.' : serverMessage(err) || 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>You&apos;ll stay signed in here; other devices are signed out.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">Your password has been changed.</div>
            <Button className="w-full" onClick={() => reset(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <Input type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
            <Input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
            <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
