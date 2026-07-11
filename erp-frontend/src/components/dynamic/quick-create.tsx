'use client';

import dynamic from 'next/dynamic';
import { X } from 'lucide-react';

// Lazy import breaks the LinkField ↔ DynamicForm import cycle.
const DynamicForm = dynamic(() => import('./dynamic-form').then((m) => m.DynamicForm), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
});

interface QuickCreateProps {
  doctype: string;
  initial?: Record<string, unknown>;
  onCreated: (name: string) => void;
  onClose: () => void;
}

/**
 * Slide-over that renders the metadata-driven form for `doctype` so a
 * missing master can be created inline from a Link field, then selected.
 */
export function QuickCreate({ doctype, initial, onCreated, onClose }: QuickCreateProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div
        className="max-h-[84vh] w-full max-w-2xl overflow-auto rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-3">
          <h3 className="text-lg font-semibold">New {doctype}</h3>
          <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          <DynamicForm
            doctype={doctype}
            initial={initial}
            onSaved={(name) => {
              if (name) onCreated(name);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
