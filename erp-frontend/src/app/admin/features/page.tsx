'use client';

export default function FeaturesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Features</h1>
        <p className="text-sm text-muted-foreground">Feature flags gated by plan or module entitlement</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No features registered yet. Features let you gate individual capabilities (beyond whole modules)
        behind a plan — e.g. &quot;Advanced Workflow&quot; or &quot;API Access&quot; — via an
        <code className="bg-muted px-1 rounded text-xs mx-1">XentraERP Feature</code> DocType.
      </div>
    </div>
  );
}
