<script setup lang="ts">
// Take payment for a bill: one or several payments, each in its own method and
// currency (cash can be tendered in any currency the organization has an
// exchange rate for). Shows what is still owed, or the change to give back, and
// hands the finished list to the caller — the server does the real arithmetic.
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'

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
}>()
const emit = defineEmits<{
  (e: 'pay', payments: { mode_of_payment: string; currency: string; tendered: number }[]): void
  (e: 'cancel'): void
}>()

interface Leg {
  mode_of_payment: string
  currency: string
  tendered: string
}

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

function money(n: number, currency = props.currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
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

function submit() {
  const payments = legs.value
    .filter((l) => Number(l.tendered) > 0)
    .map((l) => ({ mode_of_payment: l.mode_of_payment, currency: l.currency, tendered: Number(l.tendered) }))
  if (payments.length && !short.value) emit('pay', payments)
}
</script>

<template>
  <div class="modal-back" @click.self="emit('cancel')">
    <div class="modal">
      <h3 style="margin: 0 0 4px">Take payment</h3>
      <p class="sub2" style="margin: 0 0 14px">Amount due <b class="tabular">{{ money(due) }}</b></p>

      <div v-for="(l, i) in legs" :key="i" class="pay-leg">
        <select v-model="l.mode_of_payment" class="fld">
          <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="l.currency" class="fld" :disabled="currencies.length < 2">
          <option v-for="c in currencies" :key="c.currency" :value="c.currency">{{ c.currency }}</option>
        </select>
        <input v-model="l.tendered" class="fld tabular" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" />
        <button class="btn btn-ghost mini" title="Fill what is still owed" @click="fillRemaining(i)">Rest</button>
        <button v-if="legs.length > 1" class="btn btn-ghost mini" title="Remove" @click="removeLeg(i)">✕</button>
        <span v-if="l.currency !== currency && Number(l.tendered) > 0" class="conv tabular">
          = {{ money(Number(l.tendered) * rateOf(l.currency)) }} @ {{ rateOf(l.currency) }}
        </span>
      </div>
      <button class="btn btn-ghost mini" style="margin: 4px 0 12px" @click="addLeg">+ Split payment / add another currency</button>

      <div class="pay-summary">
        <div class="trow"><span>Received</span><span class="val tabular">{{ money(received) }}</span></div>
        <div v-if="short" class="trow" style="color: var(--warning)"><span>Still owed</span><span class="val tabular">{{ money(remaining) }}</span></div>
        <div v-else class="trow" style="color: var(--success)"><span>Change to give</span><span class="val tabular">{{ money(change) }}</span></div>
      </div>

      <p v-if="error" class="error-box" style="margin: 10px 0 0">{{ error }}</p>
      <div style="display: flex; gap: 10px; margin-top: 14px">
        <button class="btn btn-ghost" style="flex: 1" @click="emit('cancel')">Cancel</button>
        <button class="btn btn-primary" style="flex: 2" :disabled="busy || short || received <= 0" @click="submit">
          {{ busy ? 'Posting…' : 'Complete payment' }}
        </button>
      </div>
    </div>
  </div>
</template>
