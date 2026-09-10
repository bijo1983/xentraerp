'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'details' | 'done';

interface CountryOption {
  name: string;
  isd: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [org, setOrg] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [timeZone, setTimeZone] = useState('');

  const [result, setResult] = useState<{ tenant_code: string; subdomain: string; status: string } | null>(null);

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // best-effort — locale gets configured manually later if this fails
    }
    frappe.call('custom_erp.api.signup.list_countries')
      .then((res) => setCountries((res as CountryOption[]) || []))
      .catch(() => {});
  }, []);

  function selectCountry(name: string) {
    setCountry(name);
    // Swap out just the leading dialing code, keeping whatever local number
    // is already typed — so switching country again updates the prefix
    // instead of leaving the old one or refusing to touch a non-empty field.
    const isd = countries.find((c) => c.name === name)?.isd;
    if (!isd) return;
    setMobile((prev) => {
      const rest = prev.replace(/^\+?\d*\s*/, '');
      return `+${isd} ${rest}`;
    });
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await frappe.call('custom_erp.api.signup.complete_signup', {
        organization_name: org,
        admin_name: adminName,
        admin_email: email,
        admin_mobile: mobile,
        plan: 'Free Trial',
        country: country || undefined,
        time_zone: timeZone || undefined,
      });
      setResult(res as { tenant_code: string; subdomain: string; status: string });
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed');
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
                <Input required value={org} onChange={(e) => setOrg(e.target.value)} placeholder="JJ Consultancy" />
                <p className="text-xs text-muted-foreground">
                  You&apos;ll get a short login code after approval
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
                <label className="text-sm font-medium">Country</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  required
                  value={country}
                  onChange={(e) => selectCountry(e.target.value)}
                >
                  <option value="">Select your country</option>
                  {countries.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Sets your workspace&apos;s default currency, time zone and dialing code
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mobile Number</label>
                <Input required value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+973 3946 8552" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for Approval'}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                An admin will review your request and activate your account shortly.
              </p>
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
