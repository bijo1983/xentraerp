'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Plus } from 'lucide-react';
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
}

interface Suggestion {
  value: string;
  label: string;
}

export function LinkField({ target, value, disabled, onChange, onOpenPicker, allowCreate = true }: Props) {
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

  const search = (q: string) => {
    if (!target || q.length < 1) { setSuggestions([]); setOpen(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          txt: q,
          doctype: target,
          ignore_user_permissions: '0',
          reference_doctype: '',
          query: '',
          filters: '{}',
          page_length: '20',
        });
        const r = await fetch(`/api/method/xentraerp.desk.search.search_link?${params}`, { credentials: 'include' });
        const data = await r.json();
        const results: Suggestion[] = (data.results || data.message || []).map((x: { value: string; description?: string }) => ({
          value: x.value,
          label: x.description ? `${x.value} — ${x.description}` : x.value,
        }));
        setSuggestions(results);
        // Keep the dropdown open even with zero matches when we can offer
        // "+ Create new" — that empty state is exactly the moment a user
        // typing a genuinely new customer/item/etc. needs it.
        if (results.length > 0 || allowCreate) {
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

  const select = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(false);
  };

  const openDropdown = () => {
    if (!suggestions.length && !(allowCreate && query)) return;
    positionDropdown();
    setOpen(true);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={query}
        disabled={disabled || !target}
        placeholder={target ? `Search ${target}…` : 'Select type first'}
        className={onOpenPicker ? 'pr-8' : undefined}
        onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => { if (suggestions.length || (allowCreate && query)) openDropdown(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
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
        <ul style={dropdownStyle} className="max-h-60 overflow-y-auto rounded-md border border-border bg-card text-sm shadow-elevation-md">
          {suggestions.length === 0 && query && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No matching {target} found</li>
          )}
          {suggestions.map((s) => (
            <li
              key={s.value}
              className="cursor-pointer px-3 py-1.5 hover:bg-accent"
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
