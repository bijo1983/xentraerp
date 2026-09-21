'use client';
import { useParams, useRouter } from 'next/navigation';
import DynamicForm from '@/components/dynamic/dynamic-form';

export default function EditDocPage() {
  const { doctype, name } = useParams<{ doctype: string; name: string }>();
  const router = useRouter();

  return (
    <div className="w-full">
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
