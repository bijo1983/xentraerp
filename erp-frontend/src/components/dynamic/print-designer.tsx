'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Settings2, X } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { CompiledField } from '@/lib/meta-compiler';
import {
  Align,
  Column,
  FieldInfo,
  ItemColumn,
  PartMode,
  PrintLayout,
  TOTAL_CHOICES,
  buildLayoutHtml,
  defaultLayout,
  isPrintable,
  parseLayoutFromHtml,
} from '@/lib/print-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  doctype: string;
  fields: CompiledField[];
  itemsField: CompiledField | null;
  childFields: CompiledField[];
  /** Names of every print format already saved for this doctype. */
  formats: string[];
  /** The format currently selected in the print panel — what "Customize" starts from. */
  initialFormat: string;
  onSaved: (name: string) => void;
  onManageLetterHeads: () => void;
}

type Tab = 'fields' | 'columns' | 'totals' | 'headerfooter' | 'page' | 'html';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'fields', label: 'Fields' },
  { id: 'columns', label: 'Item columns' },
  { id: 'totals', label: 'Totals' },
  { id: 'headerfooter', label: 'Header & footer' },
  { id: 'page', label: 'Page' },
  { id: 'html', label: 'HTML' },
];

// Any letters/digits in any language; rejects characters that break URLs or paths.
const NAME_RE = /^[^/\\#?%<>"{}|^~[\]`]{1,100}$/;
const selectCls = 'h-8 rounded-md border bg-background px-1.5 text-xs';
const textareaCls = 'w-full rounded-md border bg-background p-2 font-mono text-xs';

function toInfo(f: CompiledField): FieldInfo {
  return {
    fieldname: f.fieldname,
    label: f.label || f.fieldname,
    component: f.component,
    options: f.options,
    in_list_view: f.in_list_view,
    reqd: f.reqd,
  };
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function IconBtn({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function AddSelect({ options, placeholder, onAdd }: { options: Array<{ value: string; label: string }>; placeholder: string; onAdd: (value: string) => void }) {
  if (!options.length) return null;
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onAdd(e.target.value)}
      className={`${selectCls} mt-2 w-full`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function PrintDesigner({ doctype, fields, itemsField, childFields, formats, initialFormat, onSaved, onManageLetterHeads }: Props) {
  const parentInfo = useMemo(() => fields.map(toInfo), [fields]);
  const childInfo = useMemo(() => childFields.map(toInfo), [childFields]);
  const freshLayout = () => defaultLayout(parentInfo, itemsField ? toInfo(itemsField) : null, childInfo);

  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<PrintLayout>(freshLayout);
  const [mode, setMode] = useState<'layout' | 'html'>('layout');
  const [htmlDraft, setHtmlDraft] = useState('');
  const [tab, setTab] = useState<Tab>('fields');
  const [name, setName] = useState(`${doctype} Custom`);
  // Set only when the loaded format is one of ours and editable — saving under
  // that same name updates it in place instead of failing as a duplicate.
  const [editableName, setEditableName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from whatever format is selected: one of our own layouts reopens in
  // the visual editor, a hand-written Jinja/HTML format opens in the HTML
  // editor, and a built-in/standard format (which can't be edited in place)
  // starts a fresh layout under a new name.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialFormat) {
        try {
          const doc = await frappe.getDoc('Print Format', encodeURIComponent(initialFormat));
          if (cancelled) return;
          const editable = doc.standard !== 'Yes';
          const parsed = parseLayoutFromHtml(doc.html);
          if (editable && parsed) {
            setLayout(parsed);
            setName(initialFormat);
            setEditableName(initialFormat);
            setLoading(false);
            return;
          }
          if (editable && doc.custom_format && doc.html) {
            setMode('html');
            setTab('html');
            setHtmlDraft(doc.html);
            setName(initialFormat);
            setEditableName(initialFormat);
            setLoading(false);
            return;
          }
          setName(`${initialFormat} Custom`);
        } catch {
          /* fall through to a fresh layout */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatedHtml = useMemo(() => buildLayoutHtml(layout), [layout]);

  const patch = (p: Partial<PrintLayout>) => setLayout((l) => ({ ...l, ...p }));

  // ── candidates for the "Add …" pickers ─────────────────────────────
  const detailCandidates = useMemo(() => {
    const used = new Set(layout.details.map((d) => d.fieldname));
    return parentInfo.filter((f) => isPrintable(f) && !used.has(f.fieldname)).map((f) => ({ value: f.fieldname, label: f.label }));
  }, [parentInfo, layout.details]);

  const columnCandidates = useMemo(() => {
    const used = new Set(layout.columns.map((c) => c.fieldname));
    const list = childInfo.filter((f) => isPrintable(f) && !used.has(f.fieldname)).map((f) => ({ value: f.fieldname, label: f.label }));
    return used.has('idx') ? list : [{ value: 'idx', label: 'Sr (row number)' }, ...list];
  }, [childInfo, layout.columns]);

  const totalCandidates = useMemo(() => {
    const used = new Set(layout.totals.map((t) => t.key));
    const have = new Set(parentInfo.map((f) => f.fieldname));
    return TOTAL_CHOICES.filter((t) => !used.has(t.key) && (t.key === 'taxes' || have.has(t.key))).map((t) => ({ value: t.key, label: t.label }));
  }, [parentInfo, layout.totals]);

  const labelFor = (fieldname: string, list: FieldInfo[]) => list.find((f) => f.fieldname === fieldname)?.label || fieldname;

  const save = async () => {
    const trimmed = name.trim();
    if (!NAME_RE.test(trimmed)) {
      setError('Name can\'t contain / \\ # ? % < > " { } | ^ ~ [ ] or `');
      return;
    }
    const isUpdate = editableName !== null && trimmed === editableName;
    if (!isUpdate && formats.includes(trimmed)) {
      setError(`A print format called "${trimmed}" already exists. Choose another name.`);
      return;
    }
    const html = mode === 'layout' ? generatedHtml : htmlDraft;
    if (!html.trim()) {
      setError('The HTML is empty.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isUpdate) {
        await frappe.updateDoc('Print Format', encodeURIComponent(trimmed), { html, custom_format: 1, print_format_type: 'Jinja' });
      } else {
        await frappe.createDoc('Print Format', {
          name: trimmed,
          doc_type: doctype,
          print_format_type: 'Jinja',
          // `custom_format: 1` is what makes Frappe render our `html` at all —
          // without it the engine falls back to the generic layout.
          custom_format: 1,
          standard: 'No',
          disabled: 0,
          html,
        });
        setEditableName(trimmed);
      }
      onSaved(trimmed);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const startHtmlMode = () => {
    if (!window.confirm('Edit the raw HTML? The visual editor will no longer apply to this template unless you reset it.')) return;
    setHtmlDraft(generatedHtml);
    setMode('html');
  };

  const resetToLayout = () => {
    if (!window.confirm('Discard your HTML edits and go back to the visual layout?')) return;
    setMode('layout');
    setTab('fields');
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading template…
      </div>
    );
  }

  const visibleTabs = mode === 'html' ? TABS.filter((t) => t.id === 'html') : TABS;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap gap-1">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-smooth ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-background p-2.5">
        {tab === 'fields' && mode === 'layout' && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Fields shown above the items. Pick the side each one sits on, reorder with the arrows, or remove what you
              don't want printed.
            </p>
            <div className="space-y-1.5">
              {layout.details.map((d, i) => (
                <div key={d.fieldname} className="flex items-center gap-1">
                  <Input
                    value={d.label}
                    onChange={(e) => patch({ details: layout.details.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
                    className="h-8 min-w-0 flex-1 text-xs"
                    title={d.fieldname}
                  />
                  <select
                    value={d.column}
                    onChange={(e) => patch({ details: layout.details.map((x, k) => (k === i ? { ...x, column: e.target.value as Column } : x)) })}
                    className={selectCls}
                    aria-label="Position"
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="full">Full width</option>
                  </select>
                  <IconBtn title="Move up" disabled={i === 0} onClick={() => patch({ details: move(layout.details, i, -1) })}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title="Move down" disabled={i === layout.details.length - 1} onClick={() => patch({ details: move(layout.details, i, 1) })}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title="Remove" onClick={() => patch({ details: layout.details.filter((_, k) => k !== i) })}>
                    <X className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              ))}
              {layout.details.length === 0 && <p className="text-xs text-muted-foreground">No fields — only the items and totals will print.</p>}
            </div>
            <AddSelect
              options={detailCandidates}
              placeholder="+ Add a field…"
              onAdd={(fieldname) =>
                patch({ details: [...layout.details, { fieldname, label: labelFor(fieldname, parentInfo), column: 'left' }] })
              }
            />
          </div>
        )}

        {tab === 'columns' && mode === 'layout' && (
          <div>
            {!layout.itemsFieldname ? (
              <p className="text-xs text-muted-foreground">This document has no item table.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Columns of the items table, left to right. Width is a percentage; leave it empty to size automatically.
                </p>
                <div className="space-y-1.5">
                  {layout.columns.map((c, i) => (
                    <div key={c.fieldname} className="flex items-center gap-1">
                      <Input
                        value={c.label}
                        onChange={(e) => patch({ columns: layout.columns.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
                        className="h-8 min-w-0 flex-1 text-xs"
                        title={c.fieldname}
                      />
                      <select
                        value={c.align}
                        onChange={(e) => patch({ columns: layout.columns.map((x, k) => (k === i ? { ...x, align: e.target.value as Align } : x)) })}
                        className={selectCls}
                        aria-label="Alignment"
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={c.width ?? ''}
                        placeholder="auto"
                        onChange={(e) =>
                          patch({
                            columns: layout.columns.map((x, k) => (k === i ? { ...x, width: e.target.value === '' ? null : Number(e.target.value) } : x)),
                          })
                        }
                        className="h-8 w-16 px-1.5 text-xs"
                        aria-label="Width %"
                      />
                      <IconBtn title="Move left" disabled={i === 0} onClick={() => patch({ columns: move(layout.columns, i, -1) })}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Move right" disabled={i === layout.columns.length - 1} onClick={() => patch({ columns: move(layout.columns, i, 1) })}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Remove" onClick={() => patch({ columns: layout.columns.filter((_, k) => k !== i) })}>
                        <X className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  ))}
                </div>
                <AddSelect
                  options={columnCandidates}
                  placeholder="+ Add a column…"
                  onAdd={(fieldname) => {
                    const col: ItemColumn =
                      fieldname === 'idx'
                        ? { fieldname, label: 'Sr', align: 'left', width: 6 }
                        : { fieldname, label: labelFor(fieldname, childInfo), align: childInfo.find((f) => f.fieldname === fieldname)?.component === 'number' ? 'right' : 'left', width: null };
                    patch({ columns: [...layout.columns, col] });
                  }}
                />
              </>
            )}
          </div>
        )}

        {tab === 'totals' && mode === 'layout' && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Rows of the totals block, top to bottom.</p>
            <div className="space-y-1.5">
              {layout.totals.map((t, i) => (
                <div key={t.key} className="flex items-center gap-1">
                  <Input
                    value={t.label}
                    onChange={(e) => patch({ totals: layout.totals.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
                    className="h-8 min-w-0 flex-1 text-xs"
                    title={t.key}
                  />
                  <IconBtn title="Move up" disabled={i === 0} onClick={() => patch({ totals: move(layout.totals, i, -1) })}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title="Move down" disabled={i === layout.totals.length - 1} onClick={() => patch({ totals: move(layout.totals, i, 1) })}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn title="Remove" onClick={() => patch({ totals: layout.totals.filter((_, k) => k !== i) })}>
                    <X className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              ))}
            </div>
            <AddSelect
              options={totalCandidates}
              placeholder="+ Add a total row…"
              onAdd={(key) => patch({ totals: [...layout.totals, { key, label: TOTAL_CHOICES.find((t) => t.key === key)?.label || key }] })}
            />
          </div>
        )}

        {tab === 'headerfooter' && mode === 'layout' && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                <strong>Global</strong> uses your company-wide header &amp; footer (the default set, or the one chosen
                when printing). <strong>Custom</strong> is written just for this template.
              </p>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onManageLetterHeads}>
                <Settings2 className="h-3.5 w-3.5" />
                Manage global
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Header</p>
              <select
                value={layout.header.mode}
                onChange={(e) => patch({ header: { ...layout.header, mode: e.target.value as PartMode } })}
                className={`${selectCls} w-full`}
              >
                <option value="global">Global header</option>
                <option value="custom">Custom header for this template</option>
                <option value="none">No header</option>
              </select>
              {layout.header.mode === 'custom' && (
                <textarea
                  value={layout.header.html}
                  onChange={(e) => patch({ header: { ...layout.header, html: e.target.value } })}
                  placeholder={'<h2>{{ doc.company }}</h2>'}
                  spellCheck={false}
                  className={`${textareaCls} h-24`}
                />
              )}
              {layout.header.mode !== 'none' && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={layout.header.repeat} onChange={(e) => patch({ header: { ...layout.header, repeat: e.target.checked } })} />
                  Repeat on every page
                </label>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={layout.showTitle} onChange={(e) => patch({ showTitle: e.target.checked })} />
                Show the document title ({doctype} + number)
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Footer (every page)</p>
              <select
                value={layout.footer.mode}
                onChange={(e) => patch({ footer: { ...layout.footer, mode: e.target.value as PartMode } })}
                className={`${selectCls} w-full`}
              >
                <option value="global">Global footer</option>
                <option value="custom">Custom footer for this template</option>
                <option value="none">No footer</option>
              </select>
              {layout.footer.mode === 'custom' && (
                <textarea
                  value={layout.footer.html}
                  onChange={(e) => patch({ footer: { ...layout.footer, html: e.target.value } })}
                  placeholder={'Thank you for your business'}
                  spellCheck={false}
                  className={`${textareaCls} h-20`}
                />
              )}
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={layout.footer.pageNumbers} onChange={(e) => patch({ footer: { ...layout.footer, pageNumbers: e.target.checked } })} />
                Page numbers ("Page 1 of 2")
              </label>
            </div>
          </div>
        )}

        {tab === 'page' && mode === 'layout' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-28 text-xs text-muted-foreground">Font size (pt)</span>
              <Input
                type="number"
                min={6}
                max={24}
                value={layout.fontSize}
                onChange={(e) => patch({ fontSize: Number(e.target.value) || 10 })}
                className="h-8 w-20 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={layout.showInWords} onChange={(e) => patch({ showInWords: e.target.checked })} />
              Show total in words
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={layout.showTerms} onChange={(e) => patch({ showTerms: e.target.checked })} />
              Show terms &amp; conditions
            </label>
            <Button size="sm" variant="outline" onClick={() => setLayout(freshLayout())}>
              Reset to default layout
            </Button>
          </div>
        )}

        {tab === 'html' && (
          <div className="space-y-2">
            {mode === 'layout' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  This is the HTML your layout produces. To hand-write the template instead, switch to HTML mode — you
                  can start from this and change anything.
                </p>
                <textarea value={generatedHtml} readOnly spellCheck={false} className={`${textareaCls} h-64 opacity-80`} />
                <Button size="sm" variant="outline" onClick={startHtmlMode}>
                  Edit as HTML
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Raw HTML with Jinja placeholders. Available: <code>doc</code> (the document), <code>letter_head</code>,{' '}
                  <code>footer</code>, <code>no_letterhead</code>, <code>_()</code>. Wrap a footer in{' '}
                  <code>{'<div id="footer-html" class="visible-pdf">'}</code> to repeat it on every page.
                </p>
                <textarea
                  value={htmlDraft}
                  onChange={(e) => setHtmlDraft(e.target.value)}
                  spellCheck={false}
                  className={`${textareaCls} h-72`}
                />
                <Button size="sm" variant="outline" onClick={resetToLayout}>
                  Back to visual layout
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="h-9 min-w-0 flex-1" />
          <Button size="sm" onClick={save} disabled={saving} className="shrink-0 gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editableName !== null && name.trim() === editableName ? 'Save changes' : 'Save as new'}
          </Button>
        </div>
        {error && <p className="whitespace-pre-wrap break-words text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
