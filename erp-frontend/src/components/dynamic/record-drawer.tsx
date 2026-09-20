'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, MessageSquare, History, Link2, ArrowUpRight, Send, Loader2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTenantCode, withTenant } from '@/lib/tenant';
import { doctypeListRoute } from '@/lib/doctype-routes';

interface Props {
  doctype: string;
  name: string;
  onClose: () => void;
}

type DrawerTab = 'comments' | 'activity' | 'connections';

interface CommentRow {
  name: string;
  content: string;
  owner: string;
  creation: string;
}

interface VersionRow {
  name: string;
  owner: string;
  creation: string;
  data: string;
}

interface DashboardData {
  fieldname?: string;
  non_standard_fieldnames?: Record<string, string>;
  internal_links?: Record<string, unknown>;
  transactions?: Array<{ label: string; items: string[] }>;
}

interface LinkDef {
  link_doctype: string;
  link_fieldname: string;
  group: string;
  /** True when the dashboard's `internal_links` marks this as a child-table
   * back-reference with no single reliable count (see loadLinks below) —
   * always shown as clickable instead of gated on a count. */
  unknownCount?: boolean;
}

function parseVersionSummary(raw: string): string[] {
  try {
    const d = JSON.parse(raw || '{}');
    const lines: string[] = [];
    if (Array.isArray(d.changed)) {
      for (const [field, oldV, newV] of d.changed) {
        lines.push(`${field}: ${oldV ?? '—'} → ${newV ?? '—'}`);
      }
    }
    if (Array.isArray(d.row_changed) && d.row_changed.length) {
      lines.push(`${d.row_changed.length} row change(s) in a child table`);
    }
    if (Array.isArray(d.added) && d.added.length) lines.push(`${d.added.length} row(s) added`);
    if (Array.isArray(d.removed) && d.removed.length) lines.push(`${d.removed.length} row(s) removed`);
    if (lines.length === 0 && d.creation) lines.push('Document created');
    return lines;
  } catch {
    return [];
  }
}

export function RecordDrawer({ doctype, name, onClose }: Props) {
  const router = useRouter();
  const tenantCode = useTenantCode();
  const [tab, setTab] = useState<DrawerTab>('comments');

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [links, setLinks] = useState<LinkDef[]>([]);
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({});
  const [linksLoading, setLinksLoading] = useState(false);

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const rows = await frappe.getList('Comment', {
        fields: JSON.stringify(['name', 'content', 'owner', 'creation']),
        filters: JSON.stringify([
          ['reference_doctype', '=', doctype],
          ['reference_name', '=', name],
          ['comment_type', '=', 'Comment'],
        ]),
        order_by: 'creation asc',
        limit_page_length: 0,
      });
      setComments((Array.isArray(rows) ? rows : []) as CommentRow[]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const rows = await frappe.getList('Version', {
        fields: JSON.stringify(['name', 'owner', 'creation', 'data']),
        filters: JSON.stringify([
          ['ref_doctype', '=', doctype],
          ['docname', '=', name],
        ]),
        order_by: 'creation desc',
        limit_page_length: 50,
      });
      setVersions((Array.isArray(rows) ? rows : []) as VersionRow[]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const loadLinks = async () => {
    setLinksLoading(true);
    try {
      // The doctype's own `links` meta array is sparse (a handful of
      // explicit Link-field-back-references) — the real "which documents
      // reference this one" data ERPNext's own Connections tab shows comes
      // from `__dashboard` (built server-side from each doctype's
      // `<doctype>_dashboard.py get_data()`, e.g. Customer's dashboard
      // groups Opportunity/Quotation/Sales Order/Delivery Note/Sales
      // Invoice/Payment Entry/... under labeled categories with a default
      // link fieldname plus per-doctype overrides for the odd one out
      // like Quotation using `party_name` instead of `customer`).
      const meta = await fetch(`/api/method/frappe.desk.form.load.getdoctype?doctype=${encodeURIComponent(doctype)}`, {
        credentials: 'include',
      }).then((r) => r.json());
      const docs: Array<{ name?: string; __dashboard?: DashboardData }> = meta?.docs || [];
      const rawMeta = docs.find((d) => d.name === doctype) || docs[0];
      const dash = rawMeta?.__dashboard;
      const defaultField = dash?.fieldname;
      const overrides = dash?.non_standard_fieldnames || {};
      // `internal_links` (e.g. Sales Order -> Quotation via each line's own
      // `prevdoc_docname`) has no single reliable count per Frappe's own
      // get_open_count below — always keep these clickable instead.
      const internalLinks = new Set(Object.keys(dash?.internal_links || {}));
      const defs: LinkDef[] = [];
      for (const group of dash?.transactions || []) {
        for (const item of group.items) {
          const fieldname = overrides[item] || defaultField;
          if (fieldname) defs.push({ link_doctype: item, link_fieldname: fieldname, group: group.label, unknownCount: internalLinks.has(item) });
        }
      }
      setLinks(defs);
      try {
        // The exact endpoint Frappe Desk's own Connections tab uses for its
        // count badges — deliberately NOT frappe.client.get_count, which
        // queries the target doctype's own table directly with no
        // child-table-filter resolution. Most real ERPNext connections
        // (Sales Invoice/Delivery Note back to a Sales Order, Payment Entry
        // back to an invoice, ...) store the back-reference on the child
        // table, not a top-level field on the target doctype — get_count
        // silently errored on the missing column and the catch below always
        // set that count to 0, so a Sales Invoice created from a Sales
        // Order never showed up as a connection. get_open_count already
        // knows how to resolve this the same way Desk itself does.
        const result = (await frappe.call('frappe.desk.notifications.get_open_count', { doctype, name })) as {
          count?: Array<{ name: string; count?: number }>;
        };
        const counts: Record<string, number> = {};
        for (const row of result?.count || []) {
          if (typeof row.count === 'number') counts[row.name] = row.count;
        }
        setLinkCounts(counts);
      } catch {
        setLinkCounts({});
      }
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'comments' && comments.length === 0) loadComments();
    if (tab === 'activity' && versions.length === 0) loadVersions();
    if (tab === 'connections' && links.length === 0) loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, doctype, name]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await frappe.createDoc('Comment', {
        comment_type: 'Comment',
        reference_doctype: doctype,
        reference_name: name,
        content: newComment.trim(),
      });
      setNewComment('');
      await loadComments();
    } finally {
      setPosting(false);
    }
  };

  const goToConnection = (linkDoctype: string, linkFieldname: string) => {
    const qs = new URLSearchParams({ [linkFieldname]: name }).toString();
    router.push(withTenant(`${doctypeListRoute(linkDoctype)}?${qs}`, tenantCode));
  };

  return (
    <div className="sticky top-4 flex h-[calc(100vh-6rem)] w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-elevation-xs">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex gap-1">
          {(
            [
              { key: 'comments', label: 'Comments', icon: MessageSquare },
              { key: 'activity', label: 'Activity', icon: History },
              { key: 'connections', label: 'Connections', icon: Link2 },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.label}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-smooth transition-colors',
                tab === t.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'comments' && (
          <div className="space-y-3">
            {commentsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No comments yet</p>
            ) : (
              comments.map((c) => (
                <div key={c.name} className="rounded-md border bg-muted/30 p-2.5 text-sm">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.owner}</span>
                    <span>{formatDate(c.creation)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.content}</p>
                </div>
              ))
            )}
            <div className="sticky bottom-0 space-y-2 border-t bg-card pt-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment…"
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" className="w-full gap-1.5" onClick={postComment} disabled={posting || !newComment.trim()}>
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Comment
              </Button>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-2">
            {versionsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded</p>
            ) : (
              versions.map((v) => {
                const lines = parseVersionSummary(v.data);
                return (
                  <div key={v.name} className="rounded-md border p-2.5 text-sm">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{v.owner}</span>
                      <span>{formatDate(v.creation)}</span>
                    </div>
                    {lines.length > 0 ? (
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {lines.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Updated</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'connections' && (
          <div className="space-y-1">
            {linksLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : links.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No linked documents</p>
            ) : (
              links.map((l, i) => {
                const count = linkCounts[l.link_doctype] ?? 0;
                // internal_links doctypes never get a count back from
                // get_open_count at all — treat as "may have rows",
                // clickable either way, rather than always disabled at 0.
                const clickable = l.unknownCount || count > 0;
                const showGroupHeader = i === 0 || links[i - 1].group !== l.group;
                return (
                  <div key={l.link_doctype}>
                    {showGroupHeader && (
                      <p className="mb-1 mt-3 px-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
                        {l.group}
                      </p>
                    )}
                    <button
                      onClick={() => goToConnection(l.link_doctype, l.link_fieldname)}
                      disabled={!clickable}
                      title={clickable ? `View ${l.link_doctype} linked to this document` : undefined}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-smooth',
                        clickable ? 'hover:bg-accent/50' : 'opacity-50'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {clickable && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        {l.link_doctype}
                      </span>
                      <span className={cn('text-xs', count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {l.unknownCount ? '' : count}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
