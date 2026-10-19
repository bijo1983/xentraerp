<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'

const props = withDefaults(
  defineProps<{ name: string; price: number; currency: string; image?: string | null; badge?: string | null; disabled?: boolean; outOfStock?: boolean; qtyInCart?: number }>(),
  { image: null, badge: null, disabled: false, outOfStock: false, qtyInCart: 0 },
)
const emit = defineEmits<{ (e: 'select'): void }>()
const priceText = computed(() => formatMoney(props.price, props.currency))
const initials = computed(() => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase())
</script>

<template>
  <button
    type="button"
    class="x-product"
    :class="{ 'is-out': outOfStock }"
    :disabled="disabled || outOfStock"
    :aria-label="`${name}, ${priceText}${outOfStock ? ', ' + t('ui.outOfStock') : ''}${qtyInCart ? ', ' + t('ui.inCart', { n: qtyInCart }) : ''}`"
    @click="emit('select')"
  >
    <span class="x-product__media" aria-hidden="true">
      <img v-if="image" :src="image" alt="" loading="lazy" />
      <span v-else>{{ initials }}</span>
    </span>
    <span class="x-product__name">{{ name }}</span>
    <span class="x-product__price x-tabular">{{ priceText }}</span>
    <span v-if="badge || outOfStock" class="x-product__badge">{{ outOfStock ? t('ui.outOfStock') : badge }}</span>
    <span v-if="qtyInCart" class="x-product__qty" aria-hidden="true">{{ qtyInCart }}</span>
  </button>
</template>

<style scoped>
.x-product { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: var(--x-space-1); text-align: start; padding: var(--x-space-3); border-radius: var(--x-radius-lg); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; cursor: pointer; min-height: 120px; box-shadow: var(--x-shadow-sm); }
.x-product:hover:not(:disabled) { border-color: var(--x-primary); }
.x-product:disabled { opacity: 0.6; cursor: not-allowed; }
.x-product__media { height: 56px; border-radius: var(--x-radius-md); background: var(--x-primary-soft); color: var(--x-primary-text); display: grid; place-items: center; font-weight: 700; overflow: hidden; }
.x-product__media img { width: 100%; height: 100%; object-fit: cover; }
.x-product__name { font-weight: 600; font-size: var(--x-text-sm); line-height: 1.3; }
.x-product__price { color: var(--x-text-muted); font-size: var(--x-text-sm); }
.x-product__badge { position: absolute; inset-block-start: var(--x-space-2); inset-inline-end: var(--x-space-2); font-size: 11px; background: var(--x-warning-soft); color: var(--x-warning-text); padding: 2px 8px; border-radius: var(--x-radius-full); }
.x-product__qty { position: absolute; inset-block-start: -8px; inset-inline-start: -8px; min-width: 24px; height: 24px; border-radius: 12px; background: var(--x-primary); color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
</style>
