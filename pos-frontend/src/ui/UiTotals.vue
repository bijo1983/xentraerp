<script setup lang="ts">
// Bill / receipt totals. Built to carry tax lines from the start (owner decision D6:
// VAT per tenant in Phase 2): taxable amount, one row per VAT rate, then gross. Amounts
// are formatted by lib/money.ts with the currency's own precision.
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'

export interface TotalLine {
  kind: 'subtotal' | 'discount' | 'service' | 'taxable' | 'tax' | 'rounding' | 'gross' | 'paid' | 'change' | 'due'
  label?: string
  /** VAT rate in percent for kind 'tax' (shown as "VAT 10%") */
  rate?: number | null
  amount: number
}

defineProps<{ lines: TotalLine[]; currency: string }>()

function labelOf(l: TotalLine): string {
  if (l.label) return l.label
  if (l.kind === 'tax') return l.rate !== null && l.rate !== undefined ? t('totals.taxRate', { rate: l.rate }) : t('totals.tax')
  return t(`totals.${l.kind}`)
}
</script>

<template>
  <dl class="x-totals">
    <div v-for="(l, i) in lines" :key="i" class="x-totals__row" :class="`is-${l.kind}`">
      <dt>{{ labelOf(l) }}</dt>
      <dd class="x-tabular">{{ formatMoney(l.amount, currency) }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.x-totals { margin: 0; display: flex; flex-direction: column; gap: var(--x-space-1); }
.x-totals__row { display: flex; justify-content: space-between; gap: var(--x-space-3); font-size: var(--x-text-sm); color: var(--x-text-muted); }
.x-totals__row dt, .x-totals__row dd { margin: 0; }
.x-totals__row.is-tax { padding-inline-start: var(--x-space-3); }
.x-totals__row.is-gross, .x-totals__row.is-due { color: var(--x-text); font-weight: 700; font-size: var(--x-text-lg); border-block-start: 1px dashed var(--x-border-strong); padding-block-start: var(--x-space-2); margin-block-start: var(--x-space-1); }
.x-totals__row.is-discount dd { color: var(--x-success-text); }
</style>
