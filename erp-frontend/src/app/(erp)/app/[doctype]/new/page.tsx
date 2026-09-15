'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import DynamicForm from '@/components/dynamic/dynamic-form';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { popMappedDoc } from '@/lib/mapped-doc';

export default function NewDocPage() {
  const { doctype } = useParams<{ doctype: string }>();
  const router = useRouter();
  const tenantCode = useTenantCode();
  const searchParams = useSearchParams();
  const fromKey = searchParams.get('from');
  // Read once on mount — popMappedDoc removes the sessionStorage entry as it
  // reads it, so this must not re-run on every render.
  const [initialDoc] = useState<Record<string, unknown> | undefined>(() => (fromKey ? popMappedDoc(fromKey) || undefined : undefined));

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New {decodeURIComponent(doctype)}</h1>
      <DynamicForm
        doctype={decodeURIComponent(doctype)}
        initialDoc={initialDoc}
        onSave={(savedDoc) => {
          const name = (savedDoc as Record<string, unknown>).name as string;
          router.push(withTenant(`/app/${doctype}/${encodeURIComponent(name)}`, tenantCode));
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}
