'use client';

import { useEffect, useState } from 'react';
import { Sparkles, ShieldAlert } from 'lucide-react';
import { getAiSettings, setAiSettings, type AiSettings } from '@/lib/ai/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Toggle({
  label,
  desc,
  checked,
  onChange,
  danger,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <p className={`text-sm font-medium ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function AiSettingsPage() {
  const [s, setS] = useState<AiSettings | null>(null);

  useEffect(() => setS(getAiSettings()), []);

  const update = (patch: Partial<AiSettings>) => setS(setAiSettings(patch));

  if (!s) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-primary" /> AI Assistant Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Govern how the AI agents behave. The AI only ever <strong>suggests</strong> — it cannot save or submit unless
          you explicitly allow it below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <Toggle label="Enable AI Assistant" desc="Master turn the AI features on/off." checked={s.enabled} onChange={(v) => update({ enabled: v })} />
          <Toggle
            label="Master Auto-Fill Agent"
            desc="Guided questions + default filling + code generation on new records."
            checked={s.masterAgent}
            onChange={(v) => update({ masterAgent: v })}
          />
          <Toggle
            label="Transaction Validation Agent"
            desc="Reviews draft transactions and suggests fixes for review."
            checked={s.txnAgent}
            onChange={(v) => update({ txnAgent: v })}
          />
        </CardContent>
      </Card>

      <Card className="border-red-300 dark:border-red-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" /> Governance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Default and recommended flow: <strong>AI Suggests → User Reviews → User Approves → System Saves.</strong>{' '}
            Enabling auto-save lets the AI write records directly after approval — use with caution.
          </div>
          <Toggle
            label="Allow AI to auto-save (after approval)"
            desc="When ON, the Master agent shows an “Approve & Save” action that writes the record. When OFF, the AI only fills the form and you save manually."
            checked={s.allowAutoSave}
            onChange={(v) => update({ allowAutoSave: v })}
            danger
          />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Phase-0 settings are stored in this browser. Phase 1 moves them to a tenant-level AI Settings record with role
        controls and server-side audit.
      </p>
    </div>
  );
}
