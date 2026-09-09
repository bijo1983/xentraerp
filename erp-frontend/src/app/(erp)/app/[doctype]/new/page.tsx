'use client';
import { useParams, useRouter } from 'next/navigation';
import DynamicForm from '@/components/dynamic/dynamic-form';
import { useTenantCode, withTenant } from '@/lib/tenant';

export default function NewDocPage() {
  const { doctype } = useParams<{ doctype: string }>();
  const router = useRouter();
  const tenantCode = useTenantCode();

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New {decodeURIComponent(doctype)}</h1>
      <DynamicForm
        doctype={decodeURIComponent(doctype)}
        onSave={(savedDoc) => {
          const name = (savedDoc as Record<string, unknown>).name as string;
          router.push(withTenant(`/app/${doctype}/${encodeURIComponent(name)}`, tenantCode));
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}
