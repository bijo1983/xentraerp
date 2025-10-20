// ======================================================================
// FILE: src/store/usePageFormState.ts
// Persist form state per page; prevents data loss on minimize/nav.
// ======================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Json = Record<string, unknown>;

const debounce = (fn: () => void, ms = 300) => {
  let t: number | undefined;
  return () => { clearTimeout(t); t = window.setTimeout(fn, ms); };
};

export function usePageFormState<T extends Json>(key: string, initial: T) {
  const storageKey = useMemo(() => `pageform:${key}`, [key]);
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; }
  });
  const saver = useRef(debounce(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }));

  useEffect(() => { saver.current?.(); }, [state]);

  useEffect(() => {
    const flush = () => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {} };
    window.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [state, storageKey]);

  const update = useCallback(<K extends keyof T>(k: K, v: T[K]) => setState(p => ({ ...p, [k]: v })), []);
  const clear = useCallback(() => { setState(initial); try { localStorage.removeItem(storageKey); } catch {} }, [initial, storageKey]);

  return { state, setState, update, clear };
}
