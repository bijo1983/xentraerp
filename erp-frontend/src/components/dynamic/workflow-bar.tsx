'use client';

import { Check } from 'lucide-react';
import { evalDepends } from '@/lib/eval-depends';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { WorkflowDef } from '@/types/meta';

interface WorkflowBarProps {
  workflow: WorkflowDef;
  currentState: string;
  roles: string[];
  doc: Record<string, unknown>;
  disabled?: boolean;
  onTransition: (action: string) => void;
}

/**
 * Renders an ERPNext workflow as a state stepper plus the transition
 * buttons available from the current state for the user's roles (§15).
 * A transition shows only if: from-state matches, the user holds the
 * `allowed` role, and any `condition` evaluates true.
 */
export function WorkflowBar({
  workflow,
  currentState,
  roles,
  doc,
  disabled,
  onTransition,
}: WorkflowBarProps) {
  const roleSet = new Set(roles);
  const states = workflow.states || [];
  const currentIdx = states.findIndex((s) => s.state === currentState);

  const available = (workflow.transitions || []).filter(
    (t) =>
      t.state === currentState &&
      roleSet.has(t.allowed) &&
      evalDepends(t.condition ? `eval:${t.condition}` : undefined, doc, true)
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        {/* State stepper */}
        <div className="flex flex-wrap items-center gap-2">
          {states.map((s, i) => {
            const done = currentIdx >= 0 && i < currentIdx;
            const active = s.state === currentState;
            return (
              <div key={s.state} className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : done
                        ? 'bg-green-100 text-green-700'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {done && <Check className="h-3 w-3" />}
                  {s.state}
                </span>
                {i < states.length - 1 && <span className="text-muted-foreground">→</span>}
              </div>
            );
          })}
        </div>

        {/* Transition actions */}
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {available.map((t) => (
              <Button
                key={t.action}
                type="button"
                disabled={disabled}
                onClick={() => onTransition(t.action)}
              >
                {t.action}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
