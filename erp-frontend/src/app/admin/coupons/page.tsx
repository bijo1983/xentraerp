'use client';

export default function CouponsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Coupons</h1>
        <p className="text-sm text-muted-foreground">Promotional codes and discounts</p>
      </div>
      <div className="rounded-lg border bg-background p-8 text-center text-muted-foreground text-sm">
        No coupons created yet. Coupons will let you offer percentage or fixed discounts, trial extensions,
        or setup-fee waivers at signup or renewal.
      </div>
    </div>
  );
}
