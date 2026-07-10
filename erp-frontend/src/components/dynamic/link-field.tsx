'use client';

import { useEffect, useRef, useState } from 'react';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';

interface LinkFieldProps {
  target: string; // target DocType
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Async searchable combobox bound to an ERPNext Link target DocType.
 * Debounced search via frappe.desk.search.search_link.
 */
export function LinkField({ target, value, onChange, disabled, placeholder }: LinkFieldProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<{ value: string; description?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setQuery(value), [value]);

  const runSearch = (txt: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await frappe.searchLink(target, txt);
        setOptions(res);
      } catch {
        setOptions([]);
      }
    }, 250);
  };

  return (
    <div className="relative">
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder || `Search ${target}…`}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          runSearch(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          runSearch(query);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.value);
                  setQuery(o.value);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{o.value}</span>
                {o.description && (
                  <span className="ml-2 text-xs text-muted-foreground">{o.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
