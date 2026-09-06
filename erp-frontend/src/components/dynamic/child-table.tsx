'use client';
import { useState } from 'react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField } from '@/lib/meta-compiler';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkField } from '@/components/fields/link-field';

interface Row {
  [key: string]: unknown;
  idx?: number;
}

interface Props {
  childDoctype: string;
  rows: Row[];
  readOnly?: boolean;
  onChange: (rows: Row[]) => void;
}

export function ChildTable({ childDoctype, rows, readOnly, onChange }: Props) {
  const { schema, loading } = useDocTypeSchema(childDoctype);
  const [localRows, setLocalRows] = useState<Row[]>(rows.length ? rows : []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading {childDoctype}…</p>;
  if (!schema) return null;

  const CHILD_AUTO = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', 'parent', 'parentfield', 'parenttype', 'doctype']);
  const visibleFields = schema.fields.filter(
    (f) => f.component !== 'hidden' && !f.hidden && !CHILD_AUTO.has(f.fieldname)
  );

  const updateRow = (idx: number, fieldname: string, val: unknown) => {
    const updated = localRows.map((r, i) => i === idx ? { ...r, [fieldname]: val } : r);
    setLocalRows(updated);
    onChange(updated);
  };

  const addRow = () => {
    const newRow: Row = { doctype: childDoctype, idx: localRows.length + 1 };
    visibleFields.forEach((f) => { if (f.default) newRow[f.fieldname] = f.default; });
    const updated = [...localRows, newRow];
    setLocalRows(updated);
    onChange(updated);
  };

  const removeRow = (idx: number) => {
    const updated = localRows.filter((_, i) => i !== idx);
    setLocalRows(updated);
    onChange(updated);
  };

  const renderCell = (f: CompiledField, row: Row, rowIdx: number) => {
    const val = row[f.fieldname];
    if (readOnly) return <span className="text-sm">{String(val ?? '')}</span>;

    switch (f.component) {
      case 'number':
        return (
          <Input type="number" className="h-7 text-sm" value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
      case 'date':
        return (
          <Input type="date" className="h-7 text-sm" value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
      case 'check':
        return (
          <input type="checkbox" checked={!!val}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.checked ? 1 : 0)} />
        );
      case 'link': {
        const linkTarget = f.fieldtype === 'Dynamic Link'
          ? (row[f.options || ''] as string) || ''
          : f.options || '';
        return (
          <LinkField target={linkTarget} value={String(val ?? '')}
            onChange={(v) => updateRow(rowIdx, f.fieldname, v)} />
        );
      }
      case 'select': {
        const opts = (f.options || '').split('\n').filter(Boolean);
        return (
          <select className="h-7 w-full border rounded px-1 text-sm bg-background"
            value={String(val ?? '')} onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)}>
            <option value="">—</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      default:
        return (
          <Input className="h-7 text-sm" value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            {visibleFields.map((f) => (
              <th key={f.fieldname} className="px-2 py-1 text-left border border-border font-medium whitespace-nowrap">
                {f.label}{f.reqd && <span className="text-destructive ml-0.5">*</span>}
              </th>
            ))}
            {!readOnly && <th className="w-8 border border-border" />}
          </tr>
        </thead>
        <tbody>
          {localRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-accent/30">
              {visibleFields.map((f) => (
                <td key={f.fieldname} className="px-2 py-1 border border-border">
                  {renderCell(f, row, rowIdx)}
                </td>
              ))}
              {!readOnly && (
                <td className="border border-border text-center">
                  <button onClick={() => removeRow(rowIdx)} className="text-destructive hover:opacity-80 px-1">✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <Button variant="outline" size="sm" className="mt-2" onClick={addRow}>
          + Add Row
        </Button>
      )}
    </div>
  );
}
