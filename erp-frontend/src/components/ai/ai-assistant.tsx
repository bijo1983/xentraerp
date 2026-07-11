'use client';

import { useMemo, useState } from 'react';
import { Sparkles, X, CheckCircle2, AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { planMaster, reviewTransaction, type AiContext } from '@/lib/ai/engine';
import { getAiSettings, logAiAudit } from '@/lib/ai/settings';
import type { RenderSchema } from '@/types/meta';
import { Button } from '@/components/ui/button';

interface AiAssistantProps {
  doctype: string;
  schema: RenderSchema;
  doc: Record<string, unknown>;
  isNew: boolean;
  ctx: AiContext;
  onApply: (fields: Record<string, unknown>) => void; // fill the form (never saves)
  onSaveRequested?: () => void; // only used if admin allows auto-save
  onClose: () => void;
}

const SEV_STYLE: Record<string, string> = {
  Block: 'text-red-600 dark:text-red-400',
  Warn: 'text-amber-600 dark:text-amber-400',
  Info: 'text-blue-600 dark:text-blue-400',
};

export function AiAssistant({ doctype, schema, doc, isNew, ctx, onApply, onSaveRequested, onClose }: AiAssistantProps) {
  const settings = getAiSettings();
  const mode: 'master' | 'transaction' = isNew ? 'master' : 'transaction';

  const plan = useMemo(() => (mode === 'master' ? planMaster(schema, doc, ctx) : null), [mode, schema, doc, ctx]);
  const issues = useMemo(
    () => (mode === 'transaction' ? reviewTransaction(schema, doc, ctx) : []),
    [mode, schema, doc, ctx]
  );

  // Selection state.
  const [pickedFields, setPickedFields] = useState<Record<string, boolean>>(
    () => Object.fromEntries((plan?.suggestions || []).map((s) => [s.fieldname, true]))
  );
  const [pickedFixes, setPickedFixes] = useState<Record<string, boolean>>({});

  const applyMaster = (thenSave: boolean) => {
    const fields: Record<string, unknown> = {};
    (plan?.suggestions || []).forEach((s) => {
      if (pickedFields[s.fieldname]) fields[s.fieldname] = s.value;
    });
    onApply(fields);
    logAiAudit({ agent: 'Master', doctype, action: 'Applied', detail: `Filled ${Object.keys(fields).length} fields` });
    if (thenSave && settings.allowAutoSave) {
      logAiAudit({ agent: 'Master', doctype, action: 'Applied', detail: 'Auto-save requested (admin-enabled)' });
      onSaveRequested?.();
    }
    onClose();
  };

  const applyFixes = () => {
    const fields: Record<string, unknown> = {};
    issues.forEach((iss) => {
      if (iss.fixable && iss.suggested !== undefined && pickedFixes[iss.ruleId + iss.field]) {
        fields[iss.field] = iss.suggested;
      }
    });
    onApply(fields);
    logAiAudit({ agent: 'Transaction', doctype, action: 'Applied', detail: `Applied ${Object.keys(fields).length} fixes` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">AI Assistant</p>
              <p className="text-[11px] text-muted-foreground">
                {mode === 'master' ? 'Master Auto-Fill' : 'Transaction Validation'} · {doctype}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          AI suggests — nothing is saved until you approve.
        </div>

        <div className="flex-1 overflow-auto p-4">
          {mode === 'master' && plan && (
            <div className="space-y-5">
              {plan.suggestions.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggested values
                  </h4>
                  <ul className="space-y-2">
                    {plan.suggestions.map((s) => (
                      <li key={s.fieldname} className="flex items-start gap-2 rounded-md border p-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!!pickedFields[s.fieldname]}
                          onChange={(e) => setPickedFields((p) => ({ ...p, [s.fieldname]: e.target.checked }))}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="truncate text-sm text-muted-foreground">{String(s.value)}</p>
                          <span className="text-[10px] uppercase text-muted-foreground">{s.source}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {plan.missing.length > 0 && (
                <section>
                  <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Still needed
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {plan.missing.map((m) => (
                      <li key={m.fieldname} className="text-muted-foreground">
                        · {m.label} <span className="text-[10px] uppercase text-amber-600">required</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review summary</h4>
                <div className="rounded-md border">
                  {plan.summary.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing to summarize yet.</p>}
                  {plan.summary.map((row) => (
                    <div key={row.label} className="flex justify-between border-b px-3 py-1.5 text-sm last:border-0">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {mode === 'transaction' && (
            <div className="space-y-3">
              {issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md bg-green-100 p-3 text-sm text-green-700 dark:bg-green-500/15 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> No issues detected in this draft.
                </div>
              ) : (
                issues.map((iss) => {
                  const Icon = iss.severity === 'Block' ? AlertTriangle : iss.severity === 'Warn' ? AlertTriangle : Info;
                  return (
                    <div key={iss.ruleId + iss.field} className="rounded-md border p-3">
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEV_STYLE[iss.severity]}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {iss.label} <span className={`text-[10px] uppercase ${SEV_STYLE[iss.severity]}`}>{iss.severity}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">{iss.message}</p>
                          {iss.fixable && iss.suggested !== undefined && (
                            <label className="mt-2 flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={!!pickedFixes[iss.ruleId + iss.field]}
                                onChange={(e) =>
                                  setPickedFixes((p) => ({ ...p, [iss.ruleId + iss.field]: e.target.checked }))
                                }
                              />
                              Apply fix: <span className="font-medium">{String(iss.suggested)}</span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="border-t p-3">
          {mode === 'master' ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => applyMaster(false)}>
                Approve &amp; Fill
              </Button>
              {settings.allowAutoSave && (
                <Button className="flex-1" onClick={() => applyMaster(true)}>
                  Approve &amp; Save
                </Button>
              )}
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={!issues.some((i) => i.fixable && pickedFixes[i.ruleId + i.field])}
              onClick={applyFixes}
            >
              Apply selected fixes
            </Button>
          )}
          {!settings.allowAutoSave && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Auto-save is disabled — you stay in control of the final save.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
