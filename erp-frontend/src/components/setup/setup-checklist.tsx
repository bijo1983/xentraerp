'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { SETUP_ITEMS, type SetupContext, type SetupItem } from '@/lib/setup/engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Status = 'checking' | 'present' | 'missing' | 'fixing' | 'error';

interface SetupChecklistProps {
  ctx: SetupContext;
  onProgress?: (pct: number, missing: number) => void;
  showHeaderAction?: boolean;
}

/**
 * Reusable default-masters checklist (S2 engine) used by both the
 * standalone Company Setup page and the onboarding wizard.
 */
export function SetupChecklist({ ctx, onProgress, showHeaderAction = true }: SetupChecklistProps) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const runChecks = useCallback(async () => {
    setStatuses(Object.fromEntries(SETUP_ITEMS.map((i) => [i.key, 'checking'])));
    await Promise.all(
      SETUP_ITEMS.map(async (item) => {
        try {
          const present = await item.check(ctx);
          setStatuses((s) => ({ ...s, [item.key]: present ? 'present' : 'missing' }));
        } catch {
          setStatuses((s) => ({ ...s, [item.key]: 'error' }));
        }
      })
    );
  }, [ctx]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const done = SETUP_ITEMS.filter((i) => statuses[i.key] === 'present').length;
  const pct = Math.round((done / SETUP_ITEMS.length) * 100);
  const missingCount = SETUP_ITEMS.filter(
    (i) => statuses[i.key] === 'missing' || statuses[i.key] === 'error'
  ).length;

  useEffect(() => {
    onProgress?.(pct, missingCount);
  }, [pct, missingCount, onProgress]);

  const fixOne = async (item: SetupItem) => {
    setStatuses((s) => ({ ...s, [item.key]: 'fixing' }));
    setErrors((e) => ({ ...e, [item.key]: '' }));
    try {
      await item.fix(ctx);
      const present = await item.check(ctx);
      setStatuses((s) => ({ ...s, [item.key]: present ? 'present' : 'missing' }));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { exception?: string } } })?.response?.data?.exception ||
        (err instanceof Error ? err.message : 'Failed to create.');
      setStatuses((s) => ({ ...s, [item.key]: 'error' }));
      setErrors((e) => ({ ...e, [item.key]: message }));
    }
  };

  const fixAllMissing = async () => {
    setBusy(true);
    for (const item of SETUP_ITEMS) {
      if (statuses[item.key] === 'missing' || statuses[item.key] === 'error') {
        await fixOne(item);
      }
    }
    setBusy(false);
  };

  const groups = ['Inventory', 'Sales', 'Purchase', 'Accounts'] as const;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Setup completion</span>
            <span className="text-muted-foreground">
              {done}/{SETUP_ITEMS.length} ({pct}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {showHeaderAction && missingCount > 0 && (
            <div className="mt-4 flex justify-end">
              <Button onClick={fixAllMissing} disabled={busy}>
                <Sparkles className="mr-2 h-4 w-4" />
                {busy ? 'Setting up…' : `Create ${missingCount} missing default${missingCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {groups.map((g) => {
        const items = SETUP_ITEMS.filter((i) => i.group === g);
        return (
          <Card key={g}>
            <CardHeader>
              <CardTitle className="text-base">{g}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item) => {
                const st = statuses[item.key] || 'checking';
                return (
                  <div key={item.key} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start gap-3">
                      {st === 'present' ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                      ) : st === 'checking' || st === 'fixing' ? (
                        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${st === 'error' ? 'text-destructive' : 'text-amber-500'}`} />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {item.label}
                          {item.mandatory && <span className="ml-2 text-xs text-muted-foreground">(required)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        {errors[item.key] && <p className="mt-1 text-xs text-destructive">{errors[item.key]}</p>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {st === 'present' ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">Configured</span>
                      ) : st === 'missing' || st === 'error' ? (
                        <Button size="sm" variant="outline" onClick={() => fixOne(item)}>
                          Create
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">…</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
