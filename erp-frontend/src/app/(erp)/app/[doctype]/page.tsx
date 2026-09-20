'use client';

import { useParams } from 'next/navigation';
import { DoctypeList } from '@/components/dynamic/doctype-list';

function humanize(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Generic fallback list for any doctype without a hand-curated page (see
// lib/doctype-routes.ts for the curated ones). Renders the same DoctypeList
// component those pages use — auto-deriving columns from the doctype's own
// `in_list_view` meta — so every doctype gets real filtering, bulk actions,
// CSV import/export, and deep-link filter support (RecordDrawer's
// Connections tab links here as `?<fieldname>=<value>`), not just a bare
// name-search table.
export default function DoctypeListPage() {
  const { doctype } = useParams<{ doctype: string }>();
  const decoded = decodeURIComponent(doctype);

  return (
    <DoctypeList
      key={decoded}
      title={humanize(decoded)}
      doctype={decoded}
      newLabel={`New ${humanize(decoded)}`}
    />
  );
}
