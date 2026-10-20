<script setup lang="ts">
// A number that counts up once when it scrolls into view (sample KPI widgets on the landing page).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatNumber } from '@/lib/i18n'

const props = withDefaults(defineProps<{ to: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }>(), {
  decimals: 0,
  prefix: '',
  suffix: '',
  duration: 1400,
})
const el = ref<HTMLElement | null>(null)
const value = ref(0)
const text = computed(() => `${props.prefix}${formatNumber(value.value, { minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals })}${props.suffix}`)
let io: IntersectionObserver | undefined
let raf = 0

function run() {
  const start = performance.now()
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / props.duration)
    value.value = props.to * (1 - Math.pow(1 - p, 3))
    if (p < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
onMounted(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof IntersectionObserver === 'undefined') {
    value.value = props.to
    return
  }
  io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io?.disconnect()
      run()
    }
  })
  if (el.value) io.observe(el.value)
})
onBeforeUnmount(() => {
  io?.disconnect()
  cancelAnimationFrame(raf)
})
</script>

<template>
  <span ref="el" class="x-tabular">{{ text }}</span>
</template>
