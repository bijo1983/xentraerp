'use client';
import { useParams, useRouter } from 'next/navigation';
import DynamicForm from '@/components/dynamic/dynamic-form';

export default function AdminEditDocPage() {
  const { doctype, name } = useParams<{ doctype: string; name: string }>();
  const router = useRouter();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">
        {decodeURIComponent(doctype)}: {decodeURIComponent(name)}
      </h1>
      <DynamicForm
        doctype={decodeURIComponent(doctype)}
        name={decodeURIComponent(name)}
        onSave={() => router.refresh()}
        onCancel={() => router.back()}
      />
    </div>
  );
}
