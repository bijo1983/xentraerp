'use client';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Platform Settings</h1>
        <p className="text-sm text-muted-foreground">Global XentraERP configuration</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        Platform settings (branding, default currency, tax rules, white-label options) will be configured here
        once the <code className="bg-muted px-1 rounded text-xs">XentraERP Settings</code> DocType is created.
      </div>
    </div>
  );
}
