// AI Agent settings (Phase-0 MVP: stored client-side; the blueprint's
// Xentra AI Settings DocType supersedes this in Phase 1). The critical
// governance flag `allowAutoSave` defaults to FALSE — the AI can never
// write without an admin explicitly enabling it.

export interface AiSettings {
  enabled: boolean;
  masterAgent: boolean;
  txnAgent: boolean;
  allowAutoSave: boolean; // default false — AI Suggests → User Approves → System Saves
}

const DEFAULTS: AiSettings = {
  enabled: true,
  masterAgent: true,
  txnAgent: true,
  allowAutoSave: false,
};

const KEY = 'xentra_ai_settings';

export function getAiSettings(): AiSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function setAiSettings(patch: Partial<AiSettings>) {
  const next = { ...getAiSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

// Lightweight client-side audit trail (Phase-0). Phase 1 persists to the
// Xentra AI Audit DocType.
export interface AiAuditEntry {
  ts: string;
  agent: 'Master' | 'Transaction';
  doctype: string;
  action: 'Suggested' | 'Approved' | 'Rejected' | 'Applied';
  detail: string;
}

export function logAiAudit(entry: Omit<AiAuditEntry, 'ts'>) {
  if (typeof window === 'undefined') return;
  try {
    const list: AiAuditEntry[] = JSON.parse(localStorage.getItem('xentra_ai_audit') || '[]');
    list.unshift({ ...entry, ts: new Date().toISOString() });
    localStorage.setItem('xentra_ai_audit', JSON.stringify(list.slice(0, 200)));
  } catch {
    /* ignore */
  }
}
