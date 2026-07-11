'use client';

import { useParams } from 'next/navigation';
import { DoctypeList } from '@/components/dynamic/doctype-list';

/**
 * Admin-scoped list view for a control-plane DocType (Xentra Tenant/Plan/…).
 * Renders inside the SaaS admin shell — NOT the tenant ERP module sidebar.
 * Route: /admin/app/<DocType>
 */
export default function AdminDynamicListPage() {
  const params = useParams();
  const doctype = decodeURIComponent(String(params.doctype));
  return <DoctypeList doctype={doctype} basePath="/admin/app" />;
}
