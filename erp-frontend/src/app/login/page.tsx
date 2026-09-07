'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Mode = 'password' | 'tenant';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, loading, error } = useAuthStore();
  const [mode, setMode] = useState<Mode>(params.get('tenant') ? 'tenant' : 'password');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [tenantCode, setTenantCode] = useState(params.get('tenant') || '');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [verifiedNotice, setVerifiedNotice] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      // error is set in store
    }
  };

  const sendTenantOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    setTenantLoading(true);
    try {
      await frappe.call('custom_erp.api.signup.tenant_login_request_otp', { tenant_code: tenantCode });
      setOtpSent(true);
    } catch (err: unknown) {
      setTenantError(err instanceof Error ? err.message : 'Could not find that tenant code');
    } finally {
      setTenantLoading(false);
    }
  };

  const verifyTenantOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    setTenantLoading(true);
    try {
      await frappe.call('custom_erp.api.signup.tenant_login_verify', { tenant_code: tenantCode, otp });
      setVerifiedNotice(
        'Identity verified. Full tenant sign-in requires your account to be linked — an administrator will finish setting up your login shortly.'
      );
    } catch (err: unknown) {
      setTenantError(err instanceof Error ? err.message : 'Incorrect code');
    } finally {
      setTenantLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Xentra</CardTitle>
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
            {verifiedNotice ? (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">{verifiedNotice}</div>
            ) : !otpSent ? (
              <form onSubmit={sendTenantOtp} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tenant Code</label>
                  <Input value={tenantCode} onChange={(e) => setTenantCode(e.target.value.trim())} placeholder="jjc" required className="uppercase tracking-widest text-center" />
                  <p className="text-xs text-muted-foreground">The short code you received when you signed up</p>
                </div>
                <Button type="submit" className="w-full" disabled={tenantLoading}>
                  {tenantLoading ? 'Sending…' : 'Send Verification Code'}
                </Button>
              </form>
            ) : (
              <form onSubmit={verifyTenantOtp} className="space-y-4">
                <p className="text-sm text-muted-foreground">Enter the code sent to your registered email</p>
                <Input maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" required className="text-center text-lg tracking-widest" />
                <Button type="submit" className="w-full" disabled={tenantLoading}>
                  {tenantLoading ? 'Verifying…' : 'Verify & Sign In'}
                </Button>
              </form>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-6">
          New to Xentra? <Link href="/signup" className="text-primary hover:underline font-medium">Start a free trial</Link>
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
