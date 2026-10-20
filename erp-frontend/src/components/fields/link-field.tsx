'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Plus, ArrowUpRight } from 'lucide-react';
import { withTenant } from '@/lib/tenant';
import { Input } from '@/components/ui/input';
import { createPortal } from 'react-dom';
import { QuickCreateDialog } from '@/components/dynamic/quick-create-dialog';

interface Props {
  target: string;   // the doctype to search in
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  /** Renders a search-icon button inside the field and fires on Enter — opens a richer picker (e.g. ItemPickerDialog) for callers that have one. */
  onOpenPicker?: () => void;
  /** Offers "+ Create new <target>" in the dropdown when nothing (or nothing exact) matches. Default true — set false to avoid recursive nesting inside QuickCreateDialog's own Link fields. */
  allowCreate?: boolean;
  /** Narrows the search (e.g. { company, is_group: 0 }), like Desk's set_query. */
  filters?: Record<string, unknown>;
  /** When given, a filled field shows a button that opens the linked record in a new tab. */
  tenantCode?: string | null;
}

interface Suggestion {
  value: string;
  label: string;
}

export function LinkField({ target, value, disabled, onChange, onOpenPicker, allowCreate = true, filters, tenantCode }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync external value changes
  useEffect(() => { setQuery(value); }, [value]);

  const positionDropdown = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({ position: 'fixed', top: rect.bottom, left: rect.left, width: rect.width, zIndex: 9999 });
  };

  // An empty query lists the first records, like Desk does on focus.
  const search = (q: string) => {
    if (!target) { setSuggestions([]); setOpen(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          txt: q,
          doctype: target,
          ignore_user_permissions: '0',
          reference_doctype: '',
          query: '',
          filters: JSON.stringify(filters || {}),
          page_length: '20',
        });
        const r = await fetch(`/api/method/xentraerp.desk.search.search_link?${params}`, { credentials: 'include' });
        const data = await r.json();
        const results: Suggestion[] = (data.results || data.message || []).map((x: { value: string; description?: string }) => ({
          value: x.value,
          label: x.description ? `${x.value} — ${x.description}` : x.value,
        }));
        setSuggestions(results);
        suggestionsRef.current = results;
        setActive(-1);
        if (!focused.current) return;
        // Keep the dropdown open even with zero matches when we can offer
        // "+ Create new" — that empty state is exactly the moment a user
        // typing a genuinely new customer/item/etc. needs it.
        if (results.length > 0 || (allowCreate && q)) {
          positionDropdown();
          setOpen(true);
        } else {
          setOpen(false);
        }
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);
  };

  const suggestionsRef = useRef<Suggestion[]>([]);
  const focused = useRef(false);
  const [active, setActive] = useState(-1);

  // Leaving the field: an emptied field clears the value, an exact match is
  // taken, and anything else goes back to the last real value (a link can
  // only hold an existing record).
  // Runs from a timeout after blur, so it reads refs: a suggestion clicked
  // in the meantime has already updated them.
  const queryRef = useRef(query);
  queryRef.current = query;
  const committed = useRef(value);
  useEffect(() => { committed.current = value; }, [value]);
  const resolveOnBlur = () => {
    const q = queryRef.current;
    if (q === committed.current) return;
    const typed = q.trim();
    if (!typed) {
      committed.current = '';
      onChange('');
      return;
    }
    const exact = suggestionsRef.current.find((s) => s.value.toLowerCase() === typed.toLowerCase());
    if (exact) select(exact.value);
    else setQuery(committed.current);
  };

  const select = (v: string) => {
    committed.current = v;
    queryRef.current = v;
    setQuery(v);
    onChange(v);
    setOpen(false);
  };

  const openDropdown = () => {
    if (!suggestions.length && !(allowCreate && query)) return;
    positionDropdown();
    setOpen(true);
  };

  // Only for a value that is actually set (not mid-typing) and a real record.
  const canOpen = tenantCode !== undefined && !!target && !!value && query === value;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={query}
        disabled={disabled || !target}
        placeholder={target ? `Search ${target}…` : 'Select type first'}
        className={onOpenPicker || canOpen ? 'pr-8' : undefined}
        onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => {
          focused.current = true;
          if (suggestions.length) openDropdown();
          else search(query === value ? '' : query);
        }}
        onBlur={() => {
          focused.current = false;
          setTimeout(() => {
            setOpen(false);
            resolveOnBlur();
          }, 150);
        }}
        onKeyDown={(e) => {
          if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const n = suggestions.length;
            if (!n) return;
            setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
            return;
          }
          if (open && e.key === 'Enter' && active >= 0 && suggestions[active]) {
            e.preventDefault();
            select(suggestions[active].value);
            return;
          }
          if (e.key === 'Escape' && open) {
            setOpen(false);
            return;
          }
          // Enter with no dropdown open (nothing to pick inline, or the
          // user wants a fuller search than the quick autocomplete) opens
          // the richer picker dialog, mirroring ERPNext's own item-grid
          // Enter-to-search-dialog behavior.
          if (e.key === 'Enter' && onOpenPicker && !open) {
            e.preventDefault();
            onOpenPicker();
          }
        }}
      />
      {canOpen && !onOpenPicker && (
        <a
          href={withTenant(`/app/${encodeURIComponent(target)}/${encodeURIComponent(value)}`, tenantCode ?? null)}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-smooth hover:bg-accent hover:text-foreground"
          title={`Open ${target} ${value}`}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      )}
      {onOpenPicker && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenPicker}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-smooth hover:bg-accent hover:text-foreground"
          title="Advanced search"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      )}
      {open && typeof document !== 'undefined' && createPortal(
        <ul
          // The list is portaled to <body>, outside any open modal (a Dialog, or the record drawer). A modal
          // sets pointer-events:none on everything outside itself and treats a press outside as "dismiss",
          // so without these the options showed but couldn't be clicked (or the whole popup closed).
          style={{ ...dropdownStyle, pointerEvents: 'auto' }}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          // Keep focus in the input while an option is pressed, so the modal's focus trap doesn't fight it.
          onMouseDown={(e) => e.preventDefault()}
          className="max-h-60 overflow-y-auto rounded-md border border-border bg-card text-sm shadow-elevation-md"
        >
          {suggestions.length === 0 && query && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No matching {target} found</li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={s.value}
              className={`cursor-pointer px-3 py-1.5 hover:bg-accent ${i === active ? 'bg-accent' : ''}`}
              onMouseDown={() => select(s.value)}
            >
              {s.label}
            </li>
          ))}
          {allowCreate && target && query && (
            <li
              className="flex cursor-pointer items-center gap-1.5 border-t px-3 py-1.5 font-medium text-primary hover:bg-accent"
              onMouseDown={() => {
                setOpen(false);
                setQuickCreateOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create new {target} &quot;{query}&quot;
            </li>
          )}
        </ul>,
        document.body
      )}
      {allowCreate && target && (
        <QuickCreateDialog
          doctype={target}
          initialText={query}
          open={quickCreateOpen}
          onOpenChange={setQuickCreateOpen}
          onCreated={(name) => select(name)}
        />
      )}
    </div>
  );
}
