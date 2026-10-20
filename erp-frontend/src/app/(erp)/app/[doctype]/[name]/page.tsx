'use client';
import { useParams, useRouter } from 'next/navigation';
import DynamicForm from '@/components/dynamic/dynamic-form';
import { TenantUserForm } from '@/components/users/tenant-user-form';

export default function EditDocPage() {
  const { doctype, name } = useParams<{ doctype: string; name: string }>();
  const router = useRouter();

  if (decodeURIComponent(doctype) === 'User') {
    return <TenantUserForm name={decodeURIComponent(name)} onClose={() => router.back()} />;
  }

  return (
    <div className="w-full">
      <DynamicForm
        showHeader
        doctype={decodeURIComponent(doctype)}
        name={decodeURIComponent(name)}
        onSave={() => router.refresh()}
        onCancel={() => router.back()}
      />
    </div>
  );
}
