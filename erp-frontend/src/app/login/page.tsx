'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';

type Mode = 'password' | 'tenant';
type TenantStep = 'code' | 'login' | 'change-password';

/** The proxy routes read this cookie to pick which tenant's Frappe site to
 * talk to (see erp-frontend/src/lib/tenancy/registry.ts). Clear it to target
 * the control-plane/default site; set it to route to a tenant's own site. */
function setTenantCookie(code: string | null) {
  if (typeof document === 'undefined') return;
  if (code) {
    document.cookie = `xentra_tenant=${code}; path=/; SameSite=Lax`;
  } else {
    document.cookie = 'xentra_tenant=; path=/; SameSite=Lax; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, loading, error } = useAuthStore();
  const [mode, setMode] = useState<Mode>(params.get('tenant') ? 'tenant' : 'password');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [tenantCode, setTenantCode] = useState(params.get('tenant') || '');
  const [tenantStep, setTenantStep] = useState<TenantStep>('code');
  const [orgName, setOrgName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [tenantPassword, setTenantPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantCookie(null); // always the control-plane site for the Administrator login
    try {
      await login(email, password);
      router.push('/admin');
    } catch {
      // error is set in store
    }
  };

  const lookupTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    setTenantLoading(true);
    setTenantCookie(null); // tenant_lookup itself runs against the control-plane site
    try {
      const res = await frappe.call('custom_erp.api.signup.tenant_lookup', { tenant_code: tenantCode }) as {
        organization_name: string;
        admin_email: string;
      };
      setOrgName(res.organization_name);
      setAdminEmail(res.admin_email);
      setTenantStep('login');
    } catch (err: unknown) {
      setTenantError(err instanceof Error ? err.message : 'Could not find that tenant code');
    } finally {
      setTenantLoading(false);
    }
  };

  const tenantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    setTenantLoading(true);
    setTenantCookie(tenantCode); // route this login (and everything after) to the tenant's own site
    try {
      await frappe.login(adminEmail, tenantPassword);
      const status = await frappe.call('custom_erp.api.auth.get_login_status') as { force_password_change: boolean };
      if (status.force_password_change) {
        setTenantStep('change-password');
      } else {
        router.push(`/${tenantCode}/dashboard`);
      }
    } catch (err: unknown) {
      setTenantError(err instanceof Error ? err.message : 'Incorrect password');
    } finally {
      setTenantLoading(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    if (newPassword.length < 8) {
      setTenantError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setTenantError('Passwords do not match.');
      return;
    }
    setTenantLoading(true);
    try {
      await frappe.call('custom_erp.api.auth.change_password', { new_password: newPassword });
      router.push(`/${tenantCode}/dashboard`);
    } catch (err: unknown) {
      setTenantError(err instanceof Error ? err.message : 'Failed to set new password');
    } finally {
      setTenantLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <Image src="/brand/mark.png" alt="XentraERP" width={44} height={44} className="rounded-xl mx-auto mb-3" />
        <Image src="/brand/wordmark.png" alt="XentraERP" width={180} height={33} className="mx-auto mb-1" />
        <p className="text-sm text-muted-foreground">Sign in to your account</p>
      </CardHeader>
      <CardContent>
        <div className="flex mb-6 rounded-md border p-0.5 text-sm">
          <button
            type="button"
            className={cn('flex-1 rounded-sm py-1.5 font-medium transition-colors', mode === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            onClick={() => setMode('password')}
          >
            Password
          </button>
          <button
            type="button"
            className={cn('flex-1 rounded-sm py-1.5 font-medium transition-colors', mode === 'tenant' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            onClick={() => setMode('tenant')}
          >
            Tenant Code
          </button>
        </div>

        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Administrator or email" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        )}

        {mode === 'tenant' && (
          <div className="space-y-4">
            {tenantError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{tenantError}</div>}

            {tenantStep === 'code' && (
              <form onSubmit={lookupTenant} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tenant Code</label>
                  <Input value={tenantCode} onChange={(e) => setTenantCode(e.target.value.trim())} placeholder="jjc" required className="uppercase tracking-widest text-center" />
                  <p className="text-xs text-muted-foreground">The short code you received when you signed up</p>
                </div>
                <Button type="submit" className="w-full" disabled={tenantLoading}>
                  {tenantLoading ? 'Checking…' : 'Continue'}
                </Button>
              </form>
            )}

            {tenantStep === 'login' && (
              <form onSubmit={tenantLogin} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Signing in to <strong>{orgName}</strong> as <strong>{adminEmail}</strong>
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    value={tenantPassword}
                    onChange={(e) => setTenantPassword(e.target.value)}
                    placeholder="First login? Use: admin"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={tenantLoading}>
                  {tenantLoading ? 'Signing in…' : 'Sign In'}
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                  onClick={() => { setTenantStep('code'); setTenantError(null); setTenantCookie(null); }}
                >
                  ← Use a different tenant code
                </button>
              </form>
            )}

            {tenantStep === 'change-password' && (
              <form onSubmit={submitNewPassword} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This is your first login — set a new password to continue.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Password</label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
                </div>
                <Button type="submit" className="w-full" disabled={tenantLoading}>
                  {tenantLoading ? 'Saving…' : 'Set Password & Continue'}
                </Button>
              </form>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-6">
          New to XentraERP? <Link href="/signup" className="text-primary hover:underline font-medium">Start a free trial</Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
