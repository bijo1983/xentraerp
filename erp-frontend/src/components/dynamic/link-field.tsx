'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { frappe } from '@/lib/frappe';
import { Input } from '@/components/ui/input';
import { QuickCreate } from './quick-create';

interface LinkFieldProps {
  target: string; // target DocType
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Async searchable combobox bound to an ERPNext Link target DocType.
 * When the typed value has no match, offers to quick-create the record.
 */
export function LinkField({ target, value, onChange, disabled, placeholder }: LinkFieldProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<{ value: string; description?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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

  const exactMatch = options.some((o) => o.value.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 0 && !exactMatch;

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
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />

      {open && (options.length > 0 || canCreate) && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
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
                {o.description && <span className="ml-2 text-xs text-muted-foreground">{o.description}</span>}
              </button>
            </li>
          ))}

          {canCreate && (
            <li className="border-t">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  setCreating(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Create new {target} “{query.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}

      {creating && (
        <QuickCreate
          doctype={target}
          onCreated={(name) => {
            onChange(name);
            setQuery(name);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
