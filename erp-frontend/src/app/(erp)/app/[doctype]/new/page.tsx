'use client';

import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DynamicForm } from '@/components/dynamic/dynamic-form';

/**
 * Metadata-driven create screen for ANY ERPNext DocType.
 * Route: /app/<DocType>/new  (e.g. /app/Sales%20Order/new)
 * The form is generated entirely from ERPNext metadata (Phase 1/2).
 */
export default function DynamicNewPage() {
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
          // Land back on a sensible place; list routes come in a later phase.
          router.push(name ? `/app/${encodeURIComponent(doctype)}/new?created=${encodeURIComponent(name)}` : '/dashboard');
          router.refresh();
        }}
      />
    </div>
  );
}
