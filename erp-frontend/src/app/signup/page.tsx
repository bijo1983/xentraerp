'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'details' | 'verify-email' | 'verify-mobile' | 'done';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30);
}

export default function SignupPage() {
  const router = useRouter();
  const [host, setHost] = useState('your-domain.com');
  const [step, setStep] = useState<Step>('details');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [org, setOrg] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');

  const [emailOtp, setEmailOtp] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');

  const [result, setResult] = useState<{ tenant_code: string; subdomain: string; status: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setHost(window.location.host);
  }, []);

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await frappe.call('custom_erp.api.signup.request_otp', { identifier: email, channel: 'email', purpose: 'signup' });
      setStep('verify-email');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await frappe.call('custom_erp.api.signup.verify_otp', { identifier: email, channel: 'email', otp: emailOtp, purpose: 'signup' });
      await frappe.call('custom_erp.api.signup.request_otp', { identifier: mobile, channel: 'mobile', purpose: 'signup' });
      setStep('verify-mobile');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function verifyMobileAndFinish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await frappe.call('custom_erp.api.signup.verify_otp', { identifier: mobile, channel: 'mobile', otp: mobileOtp, purpose: 'signup' });
      const res = await frappe.call('custom_erp.api.signup.complete_signup', {
        organization_name: org,
        subdomain,
        admin_name: adminName,
        admin_email: email,
        admin_mobile: mobile,
        plan: 'Free Trial',
      });
      setResult(res as { tenant_code: string; subdomain: string; status: string });
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Image src="/brand/mark.png" alt="XentraERP" width={40} height={40} className="rounded-xl mx-auto mb-3" />
          <Image src="/brand/wordmark.png" alt="XentraERP" width={150} height={27} className="mx-auto mb-3" />
          <CardTitle className="text-2xl">Start your free trial</CardTitle>
          <p className="text-sm text-muted-foreground">1 month free · all modules included</p>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          {step === 'details' && (
            <form onSubmit={submitDetails} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Organization Name</label>
                <Input required value={org} onChange={(e) => { setOrg(e.target.value); if (!subdomain) setSubdomain(slugify(e.target.value)); }} placeholder="JJ Consultancy" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Organization ID</label>
                <Input required pattern="[a-z0-9\-]+" value={subdomain} onChange={(e) => setSubdomain(slugify(e.target.value))} placeholder="jj-consultancy" />
                <p className="text-xs text-muted-foreground">
                  Your ERP will be available at {host}/<span className="font-mono">&lt;your-code&gt;</span>/ — you&apos;ll get a short login code after signup
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Name</label>
                <Input required value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Business Email</label>
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@jjconsultancy.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mobile Number</label>
                <Input required value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Verification Code'}
              </Button>
            </form>
          )}

          {step === 'verify-email' && (
            <form onSubmit={verifyEmail} className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{email}</strong></p>
              <Input required maxLength={6} value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-lg tracking-widest" />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify Email'}
              </Button>
            </form>
          )}

          {step === 'verify-mobile' && (
            <form onSubmit={verifyMobileAndFinish} className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{mobile}</strong></p>
              <Input required maxLength={6} value={mobileOtp} onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-lg tracking-widest" />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Create Account'}
              </Button>
            </form>
          )}

          {step === 'done' && result && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-amber-500 mx-auto" />
              <div>
                <p className="font-semibold">Signup received!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your account is pending admin approval. We&apos;ll email you at the address you provided
                  once it&apos;s activated — your 1-month free trial with all modules starts then.
                </p>
              </div>
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Your Tenant Code</p>
                <p className="text-2xl font-bold tracking-widest">{result.tenant_code}</p>
                <p className="text-xs text-muted-foreground mt-2">Save this — you&apos;ll use it to sign in once approved</p>
              </div>
              <Button className="w-full" variant="outline" onClick={() => router.push('/')}>
                Back to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
