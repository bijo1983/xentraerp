'use client';
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { createPortal } from 'react-dom';

interface Props {
  target: string;   // the doctype to search in
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}

interface Suggestion {
  value: string;
  label: string;
}

export function LinkField({ target, value, disabled, onChange }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sync external value changes
  useEffect(() => { setQuery(value); }, [value]);

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
        const r = await fetch(`/api/method/frappe.desk.search.search_link?${params}`, { credentials: 'include' });
        const data = await r.json();
        const results: Suggestion[] = (data.results || data.message || []).map((x: { value: string; description?: string }) => ({
          value: x.value,
          label: x.description ? `${x.value} — ${x.description}` : x.value,
        }));
        setSuggestions(results);
        if (results.length > 0) {
          if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownStyle({ position: 'fixed', top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width, zIndex: 9999 });
          }
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
    if (!suggestions.length) return;
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={query}
        disabled={disabled || !target}
        placeholder={target ? `Search ${target}…` : 'Select type first'}
        onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
        onFocus={() => { if (suggestions.length) openDropdown(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && typeof document !== 'undefined' && createPortal(
        <ul style={dropdownStyle} className="bg-card border border-border rounded shadow max-h-52 overflow-y-auto text-sm">
          {suggestions.map((s) => (
            <li
              key={s.value}
              className="px-3 py-1.5 cursor-pointer hover:bg-accent"
              onMouseDown={() => select(s.value)}
            >
              {s.label}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
