// ======================================================================
// FILE: src/hooks/useGuardAgainstHardReload.ts
// Defensive guard if any legacy listener forces reload on minimize.
// ======================================================================
import { useEffect } from 'react';

export function useGuardAgainstHardReload() {
  useEffect(() => {
    const noop = (e: Event) => { e.preventDefault?.(); };
    window.addEventListener('beforeunload', noop, { capture: true });
    window.addEventListener('visibilitychange', noop, { capture: true });
    return () => {
      window.removeEventListener('beforeunload', noop, { capture: true } as any);
      window.removeEventListener('visibilitychange', noop, { capture: true } as any);
    };
  }, []);
}
