'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any create / update / delete so callers can refresh their list. */
  onChanged?: () => void;
}

interface HeadRow {
  name: string;
  is_default: number;
  disabled: number;
}

interface Draft {
  name: string; // '' while creating a new one
  content: string;
  footer: string;
  is_default: boolean;
  disabled: boolean;
}

const EMPTY: Draft = { name: '', content: '', footer: '', is_default: false, disabled: false };

// Both fields accept Jinja: `doc` is the document being printed, so
// {{ doc.company }} etc. work in either one.
const STARTER_HEADER = `<div style="text-align: center;">
  <h2 style="margin: 0;">{{ doc.company }}</h2>
  <div>Address line, City &middot; Phone &middot; email@example.com</div>
  <hr style="margin: 6px 0;">
</div>`;
const STARTER_FOOTER = `<div style="text-align: center; font-size: 8pt; color: #666;">
  Thank you for your business &middot; {{ doc.company }}
</div>`;

// The tenant's *global* header and footer are Frappe Letter Heads: the one
// flagged "default" is applied to every print automatically, and any other
// can be picked per print. Managing them here (instead of sending people to a
// separate admin screen) is what makes "one header/footer for all documents"
// a two-click job.
export function LetterHeadDialog({ open, onOpenChange, onChanged }: Props) {
  const [heads, setHeads] = useState<HeadRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // a name, or '__new'
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const rows = await frappe.getList('Letter Head', {
        fields: JSON.stringify(['name', 'is_default', 'disabled']),
        limit_page_length: 0,
      });
      setHeads(rows as HeadRow[]);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelected(null);
    setDraft(EMPTY);
    loadList();
  }, [open, loadList]);

  const select = async (name: string) => {
    setError(null);
    setSelected(name);
    if (name === '__new') {
      setDraft({ ...EMPTY, content: STARTER_HEADER, footer: STARTER_FOOTER });
      return;
    }
    setBusy(true);
    try {
      const doc = await frappe.getDoc('Letter Head', encodeURIComponent(name));
      setDraft({
        name,
        content: doc.content || '',
        footer: doc.footer || '',
        is_default: !!doc.is_default,
        disabled: !!doc.disabled,
      });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const isNew = selected === '__new';
    const name = draft.name.trim();
    if (isNew && !name) {
      setError('Enter a name for this header & footer');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        source: 'HTML',
        footer_source: 'HTML',
        content: draft.content,
        footer: draft.footer,
        is_default: draft.is_default ? 1 : 0,
        disabled: draft.disabled ? 1 : 0,
      };
      if (isNew) {
        const created = await frappe.createDoc('Letter Head', { letter_head_name: name, ...body });
        // Frappe forces every new Letter Head to "Image" based on insert; switch
        // it to HTML so it's labelled (and later edited) as what it is.
        await frappe.updateDoc('Letter Head', encodeURIComponent(created.name), body);
        setSelected(created.name);
        setDraft((d) => ({ ...d, name: created.name }));
      } else if (selected) {
        await frappe.updateDoc('Letter Head', encodeURIComponent(selected), body);
      }
      await loadList();
      onChanged?.();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || selected === '__new') return;
    if (!window.confirm(`Delete "${selected}"? Prints that use it will fall back to no header/footer.`)) return;
    setBusy(true);
    setError(null);
    try {
      await frappe.deleteDoc('Letter Head', encodeURIComponent(selected));
      setSelected(null);
      setDraft(EMPTY);
      await loadList();
      onChanged?.();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const editing = selected !== null;
  const isNew = selected === '__new';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Global header &amp; footer</DialogTitle>
          <p className="text-xs text-muted-foreground">
            A header &amp; footer set marked <strong>default</strong> is applied to every printed document. You can still
            pick a different one for a single print, or design a custom one inside a print template. Both boxes accept
            HTML, and <code>{'{{ doc.company }}'}</code>-style placeholders for the document being printed.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-1">
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => select('__new')}>
              <Plus className="h-3.5 w-3.5" />
              New header &amp; footer
            </Button>
            <div className="max-h-[50vh] space-y-1 overflow-y-auto">
              {listLoading ? (
                <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </p>
              ) : heads.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">None yet — create your first one.</p>
              ) : (
                heads.map((h) => (
                  <button
                    key={h.name}
                    type="button"
                    onClick={() => select(h.name)}
                    className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-sm transition-smooth hover:bg-muted ${
                      selected === h.name ? 'border-primary bg-muted' : ''
                    } ${h.disabled ? 'opacity-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{h.name}</span>
                    {h.is_default ? <Star className="h-3.5 w-3.5 shrink-0 fill-current text-warning" aria-label="Default" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            {!editing ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Pick one on the left to edit it, or create a new one.
              </p>
            ) : (
              <div className="space-y-3">
                {isNew && (
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Name, e.g. Company letterhead"
                    className="h-9"
                  />
                )}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Header (HTML)</label>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDraft({ ...draft, content: STARTER_HEADER })}>
                      Insert starter
                    </button>
                  </div>
                  <textarea
                    value={draft.content}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    spellCheck={false}
                    className="h-32 w-full rounded-md border bg-background p-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Footer (HTML)</label>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDraft({ ...draft, footer: STARTER_FOOTER })}>
                      Insert starter
                    </button>
                  </div>
                  <textarea
                    value={draft.footer}
                    onChange={(e) => setDraft({ ...draft, footer: e.target.value })}
                    spellCheck={false}
                    className="h-24 w-full rounded-md border bg-background p-2 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />
                    Use for all prints (default)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.disabled} onChange={(e) => setDraft({ ...draft, disabled: e.target.checked })} />
                    Disabled
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isNew ? 'Create' : 'Save'}
                  </Button>
                  {!isNew && (
                    <Button size="sm" variant="outline" onClick={remove} disabled={busy} className="gap-1.5 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">Print again to see the change in the preview.</p>
                </div>
              </div>
            )}
            {error && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
