// Fade-up on scroll for marketing sections: elements with [data-reveal] get `.is-in` the first
// time they enter the viewport. Everything shows at once under prefers-reduced-motion or
// without IntersectionObserver (tests, old browsers).
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

export function useReveal(root: Ref<HTMLElement | null>) {
  let io: IntersectionObserver | undefined
  onMounted(() => {
    const els = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-reveal]') || [])
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io?.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    els.forEach((el) => io!.observe(el))
  })
  onBeforeUnmount(() => io?.disconnect())
}
