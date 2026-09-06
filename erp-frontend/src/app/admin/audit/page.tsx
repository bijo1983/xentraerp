'use client';

export default function AuditPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Platform-level administrative activity</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No audit entries yet. Audit logging requires the <code className="bg-muted px-1 rounded text-xs">XentraERP Audit Event</code> DocType
        and server-side hooks on tenant, plan, module, and subscription changes.
      </div>
    </div>
  );
}
