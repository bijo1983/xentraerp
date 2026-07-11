'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, MessageSquare, Paperclip, GitBranch, Send, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { Button } from '@/components/ui/button';

type Tab = 'activity' | 'comments' | 'connections' | 'attachments';

interface Row {
  name: string;
  owner?: string;
  creation?: string;
  content?: string;
  file_name?: string;
  file_url?: string;
}

const fmt = (d?: string) => (d ? new Date(d.replace(' ', 'T')).toLocaleString() : '');

export function ActivityPane({ doctype, name }: { doctype: string; name: string }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('activity');
  const [versions, setVersions] = useState<Row[]>([]);
  const [comments, setComments] = useState<Row[]>([]);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [links, setLinks] = useState<Record<string, { name: string; status?: string }[]>>({});
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const loadComments = () => frappe.getComments(doctype, name).then((r) => setComments(r || [])).catch(() => {});

  useEffect(() => {
    frappe.getVersions(doctype, name).then((r) => setVersions(r || [])).catch(() => {});
    loadComments();
    frappe.getAttachments(doctype, name).then((r) => setAttachments(r || [])).catch(() => {});
    frappe.getLinkedDocs(doctype, name).then((r) => setLinks(r || {})).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, name]);

  const postComment = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await frappe.addComment(doctype, name, draft.trim());
      setDraft('');
      await loadComments();
    } finally {
      setPosting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 top-24 z-20 rounded-md border bg-background p-2 shadow hover:bg-accent"
        title="Show activity"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
    );
  }

  const tabs: { key: Tab; icon: typeof Activity; label: string }[] = [
    { key: 'activity', icon: Activity, label: 'Activity' },
    { key: 'comments', icon: MessageSquare, label: 'Comments' },
    { key: 'connections', icon: GitBranch, label: 'Links' },
    { key: 'attachments', icon: Paperclip, label: 'Files' },
  ];

  return (
    <aside className="sticky top-20 h-[calc(100vh-6rem)] w-80 shrink-0 overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.label}
              className={`rounded p-1.5 ${tab === t.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            >
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent">
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="h-[calc(100%-3rem)] overflow-auto p-3 text-sm">
        {tab === 'activity' && (
          <ul className="space-y-3">
            {versions.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
            {versions.map((v) => (
              <li key={v.name} className="border-l-2 border-muted pl-3">
                <p className="text-xs font-medium">{v.owner}</p>
                <p className="text-xs text-muted-foreground">{fmt(v.creation)}</p>
              </li>
            ))}
          </ul>
        )}

        {tab === 'comments' && (
          <div className="flex h-full flex-col">
            <div className="mb-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && postComment()}
                placeholder="Add a comment…"
                className="h-9 w-full rounded-md border px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <Button size="icon" className="h-9 w-9" disabled={posting} onClick={postComment}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <ul className="space-y-3">
              {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments.</p>}
              {comments.map((c) => (
                <li key={c.name} className="rounded-md bg-muted/40 p-2">
                  <p className="text-xs font-medium">{c.owner}</p>
                  {/* Render as text (React-escaped) to avoid stored XSS from
                      arbitrary Comment HTML. */}
                  <div className="whitespace-pre-wrap break-words text-sm">
                    {(c.content || '').replace(/<[^>]*>/g, '')}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{fmt(c.creation)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'connections' && (
          <div className="space-y-4">
            {Object.keys(links).length === 0 && <p className="text-xs text-muted-foreground">No linked documents.</p>}
            {Object.entries(links).map(([linkedDt, docs]) =>
              docs && docs.length > 0 ? (
                <div key={linkedDt}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{linkedDt}</p>
                  <ul className="space-y-1">
                    {docs.map((d) => (
                      <li key={d.name}>
                        <Link
                          href={`/app/${encodeURIComponent(linkedDt)}/${encodeURIComponent(d.name)}`}
                          className="flex items-center justify-between rounded-md border px-2 py-1.5 hover:bg-accent"
                        >
                          <span className="text-sm">{d.name}</span>
                          {d.status && <span className="text-[10px] text-muted-foreground">{d.status}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>
        )}

        {tab === 'attachments' && (
          <ul className="space-y-2">
            {attachments.length === 0 && <p className="text-xs text-muted-foreground">No attachments.</p>}
            {attachments.map((a) => (
              <li key={a.name}>
                <a
                  href={a.file_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-accent"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate text-sm">{a.file_name}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
