'use client';

export default function ReportsAdminPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Report Entitlements</h1>
        <p className="text-sm text-muted-foreground">Assign reports to modules and plans</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No reports registered yet. Register ERPNext reports here to classify them as free, standard,
        premium, or enterprise and control which plans can access or export them.
      </div>
    </div>
  );
}
