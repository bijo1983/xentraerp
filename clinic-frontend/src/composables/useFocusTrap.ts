// Keeps keyboard focus inside an open dialog/drawer, closes it on Escape and gives focus
// back to whatever opened it (WAI-ARIA dialog pattern).
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('data-focus-skip'))
}

export function useFocusTrap(container: Ref<HTMLElement | null>, active: Ref<boolean>, onEscape: () => void) {
  let previous: HTMLElement | null = null

  function onKey(e: KeyboardEvent) {
    if (!active.value || !container.value) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      onEscape()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusables(container.value)
    if (!items.length) {
      e.preventDefault()
      container.value.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(
    active,
    async (on) => {
      if (on) {
        previous = (document.activeElement as HTMLElement) || null
        document.addEventListener('keydown', onKey, true)
        await nextTick()
        if (container.value) {
          const auto = container.value.querySelector<HTMLElement>('[autofocus],[data-autofocus]')
          ;(auto || focusables(container.value)[0] || container.value).focus()
        }
      } else {
        document.removeEventListener('keydown', onKey, true)
        previous?.focus?.()
        previous = null
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey, true)
  })
}
