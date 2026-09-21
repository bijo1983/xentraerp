'use client';

export default function BillingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">Invoices, payment status, and revenue overview</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No billing activity yet. Billing requires a payment-gateway integration (Razorpay/Stripe or similar)
        wired to tenant subscriptions — invoices and payment records will appear here once configured.
      </div>
    </div>
  );
}
