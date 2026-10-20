<script setup lang="ts">
// Take payment for a bill: one or several payments, each in its own method and
// currency (cash can be tendered in any currency the organization has an
// exchange rate for). Shows what is still owed, or the change to give back, and
// hands the finished list to the caller — the server does the real arithmetic.
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { t } from '@/lib/i18n'
import { useNetworkStore } from '@/stores/network'
import { Banknote, CircleCheck, CreditCard, Plus, Smartphone, Wallet, X } from 'lucide-vue-next'
import { currencyDecimals } from '@/lib/money'

const net = useNetworkStore()

interface Currency {
  currency: string
  rate: number // register-currency units per 1 unit of this currency
  base: boolean
}

const props = defineProps<{
  posProfile: string
  currency: string
  due: number
  methods: string[]
  busy?: boolean
  error?: string | null
  // Draft Invoice + Receipt checkout: let the cashier take part of the bill and leave the rest open.
  allowPartial?: boolean
  // The amount already received when this is collecting a balance (display only).
  balanceOf?: number
}>()
const emit = defineEmits<{
  (e: 'pay', payments: { mode_of_payment: string; currency: string; tendered: number }[], partial: boolean): void
  (e: 'cancel'): void
}>()

interface Leg {
  mode_of_payment: string
  currency: string
  tendered: string
}

const partial = ref(false)
const currencies = ref<Currency[]>([{ currency: props.currency, rate: 1, base: true }])
const legs = ref<Leg[]>([{ mode_of_payment: props.methods[0] || '', currency: props.currency, tendered: props.due ? String(props.due) : '' }])

onMounted(async () => {
  try {
    currencies.value = await api.call<Currency[]>('custom_erp.api.pos_core.list_checkout_currencies', { pos_profile: props.posProfile })
  } catch {
    /* register currency only */
  }
})

function rateOf(code: string) {
  return currencies.value.find((c) => c.currency === code)?.rate ?? 1
}

const received = computed(() => legs.value.reduce((sum, l) => sum + (Number(l.tendered) || 0) * rateOf(l.currency), 0))
const remaining = computed(() => Math.max(0, props.due - received.value))
const change = computed(() => Math.max(0, received.value - props.due))
const short = computed(() => received.value + 0.0005 < props.due)
// A short payment is only acceptable when the cashier has chosen to leave a balance open.
const blocked = computed(() => short.value && !partial.value)

// Display only, with the currency's own precision (lib/money.ts).
function money(n: number, currency = props.currency) {
  return formatMoney(n, currency)
}

function addLeg() {
  const rest = remaining.value
  legs.value.push({ mode_of_payment: props.methods[0] || '', currency: props.currency, tendered: rest > 0 ? rest.toFixed(3) : '' })
}
function removeLeg(i: number) {
  if (legs.value.length > 1) legs.value.splice(i, 1)
}
// Fill this leg with exactly what is still owed, in the leg's own currency.
function fillRemaining(i: number) {
  const leg = legs.value[i]
  const others = legs.value.reduce((sum, l, k) => (k === i ? sum : sum + (Number(l.tendered) || 0) * rateOf(l.currency)), 0)
  const owed = Math.max(0, props.due - others)
  leg.tendered = (owed / rateOf(leg.currency)).toFixed(3)
}

// Tender look: cash / card / wallet-ish icon from the Mode of Payment name.
function methodIcon(m: string) {
  const s = m.toLowerCase()
  if (/cash|نقد/.test(s)) return Banknote
  if (/card|visa|master|amex|mada|benefit|debit|credit|بطاقة/.test(s)) return CreditCard
  if (/wallet|pay|apple|google|stc|transfer/.test(s)) return Smartphone
  return Wallet
}
const isCash = (m: string) => /cash|نقد/i.test(m)
// One-tap amounts for a cash leg: exact, then the next round notes above what is owed.
function quickAmounts(i: number): number[] {
  const leg = legs.value[i]
  const others = legs.value.reduce((sum, l, k) => (k === i ? sum : sum + (Number(l.tendered) || 0) * rateOf(l.currency)), 0)
  const owed = Math.max(0, props.due - others) / rateOf(leg.currency)
  if (owed <= 0) return []
  const out = new Set<number>([Number(owed.toFixed(currencyDecimals(leg.currency)))])
  for (const step of [1, 5, 10, 20, 50, 100]) {
    const v = Math.ceil(owed / step) * step
    if (v > owed) out.add(v)
    if (out.size >= 4) break
  }
  return [...out]
}
function setAmount(i: number, v: number) {
  legs.value[i].tendered = String(v)
}

function submit() {
  const payments = legs.value
    .filter((l) => Number(l.tendered) > 0)
    .map((l) => ({ mode_of_payment: l.mode_of_payment, currency: l.currency, tendered: Number(l.tendered) }))
  if (payments.length && !blocked.value) emit('pay', payments, short.value && partial.value)
}
</script>

<template>
  <div class="modal-back" @click.self="emit('cancel')">
    <div class="pd" role="dialog" aria-modal="true" :aria-label="t('pay.title')">
      <header class="pd__head">
        <div>
          <p class="pd__eyebrow">{{ balanceOf ? t('pay.balanceDue') : t('pay.amountDue') }}</p>
          <p class="pd__due x-tabular">{{ money(due) }}</p>
        </div>
        <button type="button" class="pd__x" :aria-label="t('ui.close')" @click="emit('cancel')"><X :size="20" /></button>
      </header>

      <div class="pd__legs">
        <div v-for="(l, i) in legs" :key="i" class="pd__leg">
          <div v-if="methods.length <= 4" class="pd__methods" role="radiogroup" :aria-label="t('pay.method')">
            <button v-for="m in methods" :key="m" type="button" role="radio" :aria-checked="l.mode_of_payment === m" class="pd__method" :class="{ on: l.mode_of_payment === m }" @click="l.mode_of_payment = m">
              <component :is="methodIcon(m)" :size="20" aria-hidden="true" /><span>{{ m }}</span>
            </button>
          </div>
          <select v-else v-model="l.mode_of_payment" class="fld" :aria-label="t('pay.method')">
            <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
          </select>
          <div class="pd__amount">
            <select v-model="l.currency" class="pd__cur" :disabled="currencies.length < 2" :aria-label="t('pay.currency')">
              <option v-for="c in currencies" :key="c.currency" :value="c.currency">{{ c.currency }}</option>
            </select>
            <input v-model="l.tendered" class="pd__input x-tabular" type="number" min="0" step="any" inputmode="decimal" placeholder="0" :aria-label="t('pay.tendered')" />
            <button type="button" class="pd__chip" :title="t('pay.restHint')" @click="fillRemaining(i)">{{ t('pay.exact') }}</button>
            <button v-if="legs.length > 1" type="button" class="pd__rm" :aria-label="t('pay.removeLeg')" @click="removeLeg(i)"><X :size="16" /></button>
          </div>
          <div v-if="isCash(l.mode_of_payment) && quickAmounts(i).length > 1" class="pd__quick">
            <button v-for="q in quickAmounts(i)" :key="q" type="button" class="pd__chip x-tabular" @click="setAmount(i, q)">{{ money(q, l.currency) }}</button>
          </div>
          <p v-if="l.currency !== currency && Number(l.tendered) > 0" class="pd__conv x-tabular">= {{ money(Number(l.tendered) * rateOf(l.currency)) }} @ {{ rateOf(l.currency) }}</p>
        </div>
      </div>
      <button type="button" class="pd__add" @click="addLeg"><Plus :size="16" aria-hidden="true" />{{ t('pay.split') }}</button>

      <div class="pd__sum">
        <div class="pd__row"><span>{{ t('pay.received') }}</span><b class="x-tabular">{{ money(received) }}</b></div>
        <div v-if="short" class="pd__big is-owed"><span>{{ partial ? t('pay.leftOpen') : t('pay.stillOwed') }}</span><b class="x-tabular">{{ money(remaining) }}</b></div>
        <div v-else class="pd__big is-change"><span>{{ t('pay.change') }}</span><b class="x-tabular">{{ money(change) }}</b></div>
      </div>

      <label v-if="allowPartial" class="pd__partial">
        <input v-model="partial" type="checkbox" /> <span>{{ t('pay.partial') }}</span>
      </label>
      <p v-if="error" class="error-box" style="margin: 0" role="alert">{{ error }}</p>
      <p v-if="!net.online" class="error-box" role="alert" style="margin: 0">{{ t('offline.blocked') }}</p>
      <div class="pd__actions">
        <button type="button" class="pd__btn" @click="emit('cancel')">{{ t('ui.cancel') }}</button>
        <button type="button" class="pd__btn pd__btn--go" :disabled="busy || blocked || received <= 0 || !net.online" @click="submit">
          <span v-if="busy" class="pd__spin" aria-hidden="true" /><CircleCheck v-else :size="20" aria-hidden="true" />
          {{ busy ? t('pay.posting') : short && partial ? t('pay.takePart') : t('pay.complete') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pd { width: min(560px, 100%); max-height: 92dvh; overflow: auto; background: var(--x-surface); border: 1px solid var(--x-border); border-radius: var(--x-radius-2xl); box-shadow: var(--x-shadow-lg); padding: 24px; display: flex; flex-direction: column; gap: 16px; animation: pos-rise 220ms var(--x-ease) both; }
.pd__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; border-radius: var(--x-radius-xl); background: var(--x-brand-navy); color: #fff; background-image: radial-gradient(120% 140% at 100% 0%, rgba(37, 99, 235, 0.55), transparent 55%), radial-gradient(80% 120% at 0% 100%, rgba(20, 184, 166, 0.35), transparent 60%); }
.pd__eyebrow { margin: 0; font-size: 13px; font-weight: 600; color: rgba(226, 232, 240, 0.8); text-transform: uppercase; letter-spacing: 0.06em; }
.pd__due { margin: 4px 0 0; font-family: var(--x-font-display); font-size: clamp(30px, 6vw, 40px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; }
.pd__x { width: 40px; height: 40px; border-radius: 12px; border: 0; background: rgba(255, 255, 255, 0.12); color: #fff; display: grid; place-items: center; cursor: pointer; flex: none; }
.pd__legs { display: flex; flex-direction: column; gap: 12px; }
.pd__leg { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--x-radius-lg); border: 1px solid var(--x-border); background: var(--x-surface-2); }
.pd__methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.pd__method { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 12px; border-radius: var(--x-radius-md); border: 1.5px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-weight: 600; font-size: 14.5px; cursor: pointer; transition: border-color var(--x-duration), background var(--x-duration), color var(--x-duration); }
.pd__method svg { color: var(--x-text-muted); }
.pd__method.on { border-color: var(--x-primary); background: var(--x-primary-soft); color: var(--x-primary-text); box-shadow: 0 0 0 3px color-mix(in srgb, var(--x-primary) 14%, transparent); }
.pd__method.on svg { color: var(--x-primary-text); }
.pd__method span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pd__amount { display: flex; align-items: center; gap: 8px; min-height: 60px; padding: 0 8px 0 4px; border-radius: var(--x-radius-md); border: 1.5px solid var(--x-border); background: var(--x-surface); }
.pd__amount:focus-within { border-color: var(--x-primary); box-shadow: var(--x-focus-ring); }
.pd__cur { border: 0; background: var(--x-surface-3); border-radius: 10px; min-height: 44px; padding: 0 10px; font: inherit; font-weight: 700; color: var(--x-text); }
.pd__input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--x-text); font: inherit; font-family: var(--x-font-display); font-size: 24px; font-weight: 700; text-align: end; }
.pd__chip { min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background var(--x-duration), border-color var(--x-duration); }
.pd__chip:hover { border-color: var(--x-primary); color: var(--x-primary-text); background: var(--x-primary-soft); }
.pd__rm { width: 36px; height: 36px; border-radius: 10px; border: 0; background: transparent; color: var(--x-text-faint); display: grid; place-items: center; cursor: pointer; }
.pd__rm:hover { background: var(--x-danger-soft); color: var(--x-danger); }
.pd__quick { display: flex; flex-wrap: wrap; gap: 8px; }
.pd__conv { margin: 0; font-size: 12.5px; color: var(--x-text-muted); }
.pd__add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; color: var(--x-primary-text); font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; padding: 4px 0; }
.pd__sum { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px dashed var(--x-border-strong); }
.pd__row { display: flex; justify-content: space-between; font-size: 14.5px; color: var(--x-text-muted); }
.pd__row b { color: var(--x-text); }
.pd__big { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 14px; border-radius: var(--x-radius-md); font-weight: 700; }
.pd__big b { font-family: var(--x-font-display); font-size: 24px; letter-spacing: -0.02em; }
.pd__big.is-change { background: var(--x-success-soft); color: var(--x-success-text); }
.pd__big.is-owed { background: var(--x-warning-soft); color: var(--x-warning-text); }
.pd__partial { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; line-height: 1.45; color: var(--x-text-muted); }
.pd__partial input { width: 20px; height: 20px; flex: none; margin-top: 1px; }
.pd__actions { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
.pd__btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; border-radius: var(--x-radius-lg); border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); font: inherit; font-weight: 600; font-size: 15.5px; cursor: pointer; }
.pd__btn--go { border: 0; background: var(--x-success); color: #fff; font-family: var(--x-font-display); font-size: 17px; font-weight: 700; box-shadow: 0 10px 24px -10px rgba(16, 185, 129, 0.75); }
.pd__btn--go:hover:not(:disabled) { background: #059669; }
.pd__btn--go:disabled { background: var(--x-surface-3); color: var(--x-text-faint); box-shadow: none; cursor: not-allowed; }
.pd__spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid currentColor; border-inline-end-color: transparent; animation: x-spin 0.8s linear infinite; }
@keyframes x-spin { to { transform: rotate(360deg); } }
@media (max-width: 520px) { .pd { padding: 16px; border-radius: var(--x-radius-xl); } .pd__actions { grid-template-columns: 1fr; } .pd__actions .pd__btn:first-child { order: 2; } }
</style>
