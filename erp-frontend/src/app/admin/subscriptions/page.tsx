'use client';

export default function SubscriptionsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Tenant subscription lifecycle management</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No subscriptions yet. Subscriptions are created automatically when a tenant completes signup.
        <br />
        Requires the <code className="bg-muted px-1 rounded text-xs">XentraERP Subscription</code> DocType.
      </div>
    </div>
  );
}
