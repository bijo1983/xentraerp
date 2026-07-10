'use client';

import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DynamicForm } from '@/components/dynamic/dynamic-form';

/**
 * Metadata-driven edit screen for ANY ERPNext DocType record.
 * Route: /app/<DocType>/<name>
 */
export default function DynamicEditPage() {
  const router = useRouter();
  const params = useParams();
  const doctype = decodeURIComponent(String(params.doctype));
  const name = decodeURIComponent(String(params.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
          router.push(`/app/${encodeURIComponent(doctype)}`);
          router.refresh();
        }}
      />
    </div>
  );
}
