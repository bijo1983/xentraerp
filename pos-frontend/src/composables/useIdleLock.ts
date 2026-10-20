// Locks the till after N idle minutes (POS Settings idle_lock_minutes; 0 = never).
// Kitchen displays never lock (always-on boards). The server enforces the lock too.
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

export function useIdleLock(minutes: Ref<number>, enabled: Ref<boolean>, onIdle: () => void) {
  let last = Date.now()
  let timer: number | undefined
  const bump = () => {
    last = Date.now()
  }
  function tick() {
    if (!enabled.value || !minutes.value) return
    if (Date.now() - last > minutes.value * 60_000) {
      last = Date.now()
      onIdle()
    }
  }
  onMounted(() => {
    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    timer = window.setInterval(tick, 15_000)
  })
  onBeforeUnmount(() => {
    EVENTS.forEach((e) => window.removeEventListener(e, bump))
    if (timer) window.clearInterval(timer)
  })
  watch(enabled, bump)
  return { bump, tick, lastActivity: () => last }
}
