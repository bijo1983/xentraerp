// App-wide toasts (UiToastHost renders them). Errors carry the request reference so staff
// can quote it to support; never a stack trace.
import { reactive } from 'vue'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'
export interface Toast {
  id: number
  tone: ToastTone
  message: string
  reference?: string
  timeout: number
}

export const toasts = reactive<Toast[]>([])
let seq = 0

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

export function pushToast(message: string, tone: ToastTone = 'info', opts: { reference?: string; timeout?: number } = {}): number {
  const id = ++seq
  const timeout = opts.timeout ?? (tone === 'danger' ? 8000 : 4000)
  toasts.push({ id, tone, message, reference: opts.reference, timeout })
  if (toasts.length > 4) toasts.splice(0, toasts.length - 4)
  if (timeout > 0 && typeof window !== 'undefined') window.setTimeout(() => dismissToast(id), timeout)
  return id
}

export function useToast() {
  return {
    info: (m: string) => pushToast(m, 'info'),
    success: (m: string) => pushToast(m, 'success'),
    warning: (m: string) => pushToast(m, 'warning'),
    error: (m: string, reference?: string) => pushToast(m, 'danger', { reference }),
    dismiss: dismissToast,
  }
}
