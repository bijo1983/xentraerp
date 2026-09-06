'use client';
import { useParams, useRouter } from 'next/navigation';
import DynamicForm from '@/components/dynamic/dynamic-form';

export default function AdminNewDocPage() {
  const { doctype } = useParams<{ doctype: string }>();
  const router = useRouter();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New {decodeURIComponent(doctype)}</h1>
      <DynamicForm
        doctype={decodeURIComponent(doctype)}
        onSave={(savedDoc) => {
          const name = (savedDoc as Record<string, unknown>).name as string;
          router.push(`/admin/app/${doctype}/${encodeURIComponent(name)}`);
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}
