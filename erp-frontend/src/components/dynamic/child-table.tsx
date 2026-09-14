'use client';
import { useState } from 'react';
import { useDocTypeSchema } from '@/hooks/use-doctype-schema';
import { CompiledField, evalDependsOn, isTruthyDocValue } from '@/lib/meta-compiler';
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
  // The parent transaction's doc — used as a fallback context when
  // evaluating a child field's depends_on for fields not present on the
  // row itself (Frappe's own grid does the same: row context first, doc
  // context second).
  parentDoc?: Record<string, unknown>;
}

// Builds a doc-like object for depends_on evaluation: row fields take
// precedence, falling back to the parent doc's fields for anything the row
// doesn't define itself.
function rowEvalContext(row: Row, parentDoc?: Record<string, unknown>): Record<string, unknown> {
  return { ...(parentDoc || {}), ...row };
}

export function ChildTable({ childDoctype, rows, readOnly, onChange, parentDoc }: Props) {
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

    // Per-row depends_on: Frappe evaluates a child field's depends_on
    // against the row first, falling back to the parent doc for fields the
    // row doesn't carry. Since rows in the same column can disagree, we
    // keep the column but blank out cells whose condition isn't met rather
    // than hiding the whole column.
    if (!evalDependsOn(f.depends_on, rowEvalContext(row, parentDoc))) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }

    if (readOnly) return <span className="text-sm">{String(val ?? '')}</span>;

    switch (f.component) {
      case 'number':
        return (
          <Input type="number" className="h-8 text-sm" value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
      case 'date':
        return (
          <Input type="date" className="h-8 text-sm" value={String(val ?? '')}
            onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)} />
        );
      case 'check':
        return (
          <input type="checkbox" checked={isTruthyDocValue(val)}
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
          <select className="h-8 w-full border rounded px-1 text-sm bg-background"
            value={String(val ?? '')} onChange={(e) => updateRow(rowIdx, f.fieldname, e.target.value)}>
            <option value="">—</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      default:
        return (
          <Input className="h-8 text-sm" value={String(val ?? '')}
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
              <th key={f.fieldname} className="px-2 py-1.5 text-left border border-border font-medium whitespace-nowrap min-w-[120px]">
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
                <td key={f.fieldname} className="px-2 py-1 border border-border min-w-[120px]">
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
