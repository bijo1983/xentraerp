'use client';

export default function ProvisioningPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Provisioning</h1>
        <p className="text-sm text-muted-foreground">Tenant provisioning jobs and status</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No provisioning jobs yet. When a tenant is approved on the{' '}
        <a href="/admin/tenants" className="text-primary hover:underline">Tenants</a> page, this will track
        each stage of setup (site creation, module activation, admin account) end to end.
      </div>
    </div>
  );
}
