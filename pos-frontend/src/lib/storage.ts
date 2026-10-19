// Per-device conveniences only (theme, language, remembered organization). Every access
// is wrapped: storage can be unavailable (private mode, blocked site data) and the app
// must work without it. Never store tokens, PINs or session data here.
export function readJson<T>(key: string, fallback: T, store: 'local' | 'session' = 'local'): T {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage
    const raw = s.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown, store: 'local' | 'session' = 'local') {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage
    if (value === null || value === undefined) s.removeItem(key)
    else s.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: the setting just isn't remembered */
  }
}
