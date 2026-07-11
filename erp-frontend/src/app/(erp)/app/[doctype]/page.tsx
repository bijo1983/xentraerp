'use client';

import { useParams } from 'next/navigation';
import { DoctypeList } from '@/components/dynamic/doctype-list';

/**
 * Metadata-driven list view for ANY ERPNext DocType.
 * Route: /app/<DocType>
 */
export default function DynamicListPage() {
  const params = useParams();
  const doctype = decodeURIComponent(String(params.doctype));
  return <DoctypeList doctype={doctype} basePath="/app" />;
}
