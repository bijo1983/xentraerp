'use client';

import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DynamicForm } from '@/components/dynamic/dynamic-form';
import { ActivityPane } from '@/components/dynamic/activity-pane';

/**
 * Admin-scoped edit screen for a control-plane DocType record.
 * Renders inside the SaaS admin shell — NOT the tenant ERP module sidebar.
 * Route: /admin/app/<DocType>/<name>
 */
export default function AdminDynamicEditPage() {
  const router = useRouter();
  const params = useParams();
  const doctype = decodeURIComponent(String(params.doctype));
  const name = decodeURIComponent(String(params.name));

  return (
    <div className="mx-auto flex max-w-7xl gap-6">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded p-1.5 hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{doctype}</p>
            <h2 className="text-2xl font-bold">{name}</h2>
          </div>
        </div>

        <DynamicForm
          doctype={doctype}
          name={name}
          onSaved={() => {
            router.push(`/admin/app/${encodeURIComponent(doctype)}`);
            router.refresh();
          }}
        />
      </div>

      <ActivityPane doctype={doctype} name={name} />
    </div>
  );
}
