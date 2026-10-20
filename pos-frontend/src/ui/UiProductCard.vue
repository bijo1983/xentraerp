<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'

const props = withDefaults(
  defineProps<{
    name: string
    price: number
    currency: string
    image?: string | null
    group?: string | null
    badge?: string | null
    disabled?: boolean
    outOfStock?: boolean
    qtyInCart?: number
    compact?: boolean
  }>(),
  { image: null, group: null, badge: null, disabled: false, outOfStock: false, qtyInCart: 0, compact: false },
)
const emit = defineEmits<{ (e: 'select'): void }>()
const priceText = computed(() => formatMoney(props.price, props.currency))
// Re-key the badge on every change so the "bump" plays each time something is added.
const bump = ref(0)
const broken = ref(false)
const hasPhoto = computed(() => !!props.image && !broken.value)
watch(() => props.image, () => (broken.value = false))
watch(() => props.qtyInCart, (n, o) => n > (o ?? 0) && bump.value++)
</script>

<template>
  <button
    type="button"
    class="x-product"
    :class="{ 'is-out': outOfStock, 'is-compact': compact, 'is-in-cart': qtyInCart > 0, 'has-photo': hasPhoto }"
    :disabled="disabled || outOfStock"
    :aria-label="`${name}, ${priceText}${outOfStock ? ', ' + t('ui.outOfStock') : ''}${qtyInCart ? ', ' + t('ui.inCart', { n: qtyInCart }) : ''}`"
    @click="emit('select')"
  >
    <span class="x-product__top">
      <span class="x-product__text">
        <span v-if="group" class="x-product__group">{{ group }}</span>
        <span class="x-product__name" :title="name">{{ name }}</span>
      </span>
      <!-- A photo only when one is set on the Item in XentraERP; no placeholder otherwise. -->
      <span v-if="hasPhoto" class="x-product__media"><img :src="image!" alt="" loading="lazy" decoding="async" @error="broken = true" /></span>
    </span>
    <span class="x-product__foot">
      <span class="x-product__price x-tabular">{{ priceText }}</span>
      <span class="x-product__add" aria-hidden="true"><Plus :size="16" :stroke-width="2.5" /></span>
    </span>
    <span v-if="badge || outOfStock" class="x-product__badge">{{ outOfStock ? t('ui.outOfStock') : badge }}</span>
    <span v-if="qtyInCart" :key="bump" class="x-product__qty x-tabular" aria-hidden="true">{{ qtyInCart }}</span>
  </button>
</template>

<style scoped>
.x-product {
  position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; text-align: start; padding: 14px;
  min-height: 128px; border-radius: var(--x-radius-lg); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text);
  font: inherit; cursor: pointer; box-shadow: var(--x-shadow-xs);
  transition: transform var(--x-duration) var(--x-ease), box-shadow var(--x-duration) var(--x-ease), border-color var(--x-duration);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none;
}
.x-product:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--x-shadow-md); border-color: color-mix(in srgb, var(--x-primary) 35%, var(--x-border)); }
.x-product:active:not(:disabled) { transform: scale(0.97); box-shadow: var(--x-shadow-xs); }
.x-product.is-in-cart { border-color: color-mix(in srgb, var(--x-primary) 55%, var(--x-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--x-primary) 14%, transparent), var(--x-shadow-xs); }
.x-product:disabled { opacity: 0.55; cursor: not-allowed; }
.x-product__top { display: flex; align-items: flex-start; gap: 10px; }
.x-product__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.x-product__media { width: 54px; height: 54px; flex: none; border-radius: 14px; overflow: hidden; box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06), var(--x-shadow-sm); }
.x-product__media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform var(--x-duration-slow) var(--x-ease); }
.x-product:hover:not(:disabled) .x-product__media img { transform: scale(1.06); }
.x-product__group { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--x-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.x-product__name { font-weight: 600; font-size: 15px; line-height: 1.3; color: var(--x-text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.x-product__foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.x-product__price { font-family: var(--x-font-display); font-weight: 700; font-size: 16px; color: var(--x-text); white-space: nowrap; }
.x-product__add { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; background: var(--x-primary-soft); color: var(--x-primary-text); flex: none; transition: background var(--x-duration), color var(--x-duration); }
.x-product:hover:not(:disabled) .x-product__add { background: var(--x-primary); color: #fff; }
.x-product__badge { position: absolute; inset-block-end: 50px; inset-inline-end: 12px; font-size: 11px; font-weight: 700; background: var(--x-warning-soft); color: var(--x-warning-text); padding: 3px 8px; border-radius: var(--x-radius-full); }
.x-product__qty { position: absolute; inset-block-start: -8px; inset-inline-end: -8px; z-index: 3; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 13px; background: var(--x-primary); color: #fff; font-size: 12.5px; font-weight: 700; display: grid; place-items: center; box-shadow: 0 0 0 3px var(--x-bg), var(--x-shadow-brand); animation: x-bump 260ms var(--x-ease-spring); }
.is-compact { min-height: 0; padding: 10px 12px; gap: 8px; }
.is-compact .x-product__group { display: none; }
.is-compact .x-product__name { -webkit-line-clamp: 1; font-size: 14px; }
.is-compact .x-product__media { width: 40px; height: 40px; border-radius: 10px; }
.is-compact .x-product__add { width: 26px; height: 26px; }
.is-compact .x-product__price { font-size: 15px; }
</style>
