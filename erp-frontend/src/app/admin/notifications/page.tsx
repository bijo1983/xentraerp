'use client';

const TEMPLATES = [
  { name: 'Signup Received', trigger: 'Tenant completes signup wizard', status: 'Live' },
  { name: 'Tenant Approved', trigger: 'Admin approves a pending tenant', status: 'Live' },
  { name: 'Tenant Rejected', trigger: 'Admin rejects a pending tenant', status: 'Live' },
  { name: 'Trial Expiry Reminder', trigger: '3 days before trial ends', status: 'Not configured' },
  { name: 'Payment Failed', trigger: 'Subscription payment fails', status: 'Not configured' },
  { name: 'Renewal Reminder', trigger: '7 days before renewal', status: 'Not configured' },
];

export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Notification Templates</h1>
        <p className="text-sm text-muted-foreground">Automated emails sent to tenants and administrators</p>
      </div>
      <div className="rounded-md border overflow-x-auto bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Template</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Trigger</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map((t) => (
              <tr key={t.name} className="border-b hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.trigger}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'Live' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        &quot;Live&quot; templates are already wired into the signup and approval flow. Others need a scheduled job or payment webhook to trigger them.
      </p>
    </div>
  );
}
