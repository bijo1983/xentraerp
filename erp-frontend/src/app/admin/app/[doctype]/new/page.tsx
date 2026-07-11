'use client';

import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DynamicForm } from '@/components/dynamic/dynamic-form';

/**
 * Admin-scoped create screen for a control-plane DocType.
 * Renders inside the SaaS admin shell.
 * Route: /admin/app/<DocType>/new
 */
export default function AdminDynamicNewPage() {
  const router = useRouter();
  const params = useParams();
  const doctype = decodeURIComponent(String(params.doctype));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded p-1.5 hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-bold">New {doctype}</h2>
      </div>

      <DynamicForm
        doctype={doctype}
        onSaved={(name) => {
          router.push(
            name
              ? `/admin/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
              : `/admin/app/${encodeURIComponent(doctype)}`
          );
          router.refresh();
        }}
      />
    </div>
  );
}
