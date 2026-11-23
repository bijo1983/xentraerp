// Voice dictation for clinical notes through the browser's speech recognition (Web Speech API:
// Chrome, Edge, Safari). Only one field listens at a time; spoken punctuation ("full stop",
// "comma", "new line", "next point") becomes the real character. Audio never touches the clinic's
// server; the browser's own recogniser handles it (Chrome sends it to its speech service).
import { computed, ref } from 'vue'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any

const LANG_KEY = 'clinza.dictation.lang'
export const DICTATION_LANGS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
]

function readLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) || 'en-US'
  } catch {
    return 'en-US'
  }
}

const active = ref<string | null>(null) // id of the listening field
const interim = ref('')
const lang = ref(readLang())
const error = ref('')
let rec: Rec = null
let onFinal: ((text: string) => void) | null = null

const SPOKEN: [RegExp, string][] = [
  [/\s*\b(full stop|period)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\b(question mark)\b/gi, '?'],
  [/\s*\bcolon\b/gi, ':'],
  [/\s*\b(new line|next line)\b\s*/gi, '\n'],
  [/\s*\b(new paragraph)\b\s*/gi, '\n\n'],
  [/\s*\b(next point|bullet)\b\s*/gi, '\n• '],
]

/** Applies spoken punctuation and sentence case to a recognised phrase. */
export function cleanTranscript(raw: string): string {
  let s = ` ${raw.trim()}`
  for (const [re, ch] of SPOKEN) s = s.replace(re, ch)
  s = s.trim().replace(/(^|[.?!]\s+|\n)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
  return s
}

/** Joins dictated text onto what's already in the field with sensible spacing. */
export function appendText(current: string, add: string): string {
  if (!add) return current
  if (!current) return add
  if (/\s$/.test(current) || add.startsWith('\n') || /^[.,?:]/.test(add)) return current + add
  return `${current} ${add}`
}

export function useDictation() {
  const supported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  function stop() {
    try {
      rec?.stop()
    } catch {
      /* already stopped */
    }
    rec = null
    active.value = null
    interim.value = ''
    onFinal = null
  }

  function start(id: string, cb: (text: string) => void) {
    if (!supported) {
      error.value = 'Voice dictation needs Chrome, Edge or Safari.'
      return
    }
    if (active.value) stop()
    error.value = ''
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    rec = new R()
    rec.lang = lang.value
    rec.continuous = true
    rec.interimResults = true
    onFinal = cb
    rec.onresult = (ev: any) => {
      let partial = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) onFinal?.(cleanTranscript(r[0].transcript))
        else partial += r[0].transcript
      }
      interim.value = partial
    }
    rec.onerror = (ev: any) => {
      error.value = ev.error === 'not-allowed' ? 'Allow microphone access for this site to dictate.' : ev.error === 'no-speech' ? '' : `Dictation stopped (${ev.error}).`
    }
    rec.onend = () => {
      // Chrome ends a continuous session after a pause; keep listening until the user stops.
      if (active.value === id && rec) {
        try {
          rec.start()
        } catch {
          stop()
        }
      }
    }
    active.value = id
    rec.start()
  }

  function toggle(id: string, cb: (text: string) => void) {
    if (active.value === id) stop()
    else start(id, cb)
  }

  function setLang(code: string) {
    lang.value = code
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* not remembered */
    }
    if (active.value && onFinal) {
      const id = active.value
      const cb = onFinal
      stop()
      start(id, cb)
    }
  }

  return { supported, active: computed(() => active.value), interim: computed(() => interim.value), lang: computed(() => lang.value), error: computed(() => error.value), start, stop, toggle, setLang }
}
