<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { clinic, errorMessage } from '@/lib/api'
import { money } from '@/lib/format'
import UiModal from '@/ui/UiModal.vue'
import UiButton from '@/ui/UiButton.vue'
import UiBanner from '@/ui/UiBanner.vue'
import { useClinicStore } from '@/stores/clinic'

const props = defineProps<{ open: boolean; invoice: string; outstanding: number; currency?: string; who?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'paid'): void }>()
const amount = ref(0)
const mode = ref('Cash')
const ref_no = ref('')
const busy = ref(false)
const error = ref('')
const store = useClinicStore()
const MODES = computed(() => (store.ctx?.modes_of_payment?.length ? store.ctx.modes_of_payment : ['Cash']))

watch(
  () => props.open,
  (o) => {
    if (o) {
      amount.value = props.outstanding
      mode.value = MODES.value.includes('Cash') ? 'Cash' : MODES.value[0]
      ref_no.value = ''
      error.value = ''
    }
  },
)
async function pay() {
  busy.value = true
  error.value = ''
  try {
    await clinic('record_payment', { invoice: props.invoice, amount: amount.value, mode_of_payment: mode.value, reference_no: ref_no.value || undefined })
    emit('paid')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal :open="open" title="Take payment" size="sm" @close="emit('close')">
    <form id="pay-form" class="stack" @submit.prevent="pay">
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <div class="muted">{{ who }} · {{ invoice }} · outstanding <strong class="tabular">{{ money(outstanding, currency) }}</strong></div>
      <label class="f"><span>Amount</span><input v-model.number="amount" type="number" min="0" :max="outstanding" step="0.001" required autofocus /></label>
      <label class="f"><span>Method</span><select v-model="mode"><option v-for="m in MODES" :key="m">{{ m }}</option></select></label>
      <label v-if="mode !== 'Cash'" class="f"><span>Reference (card slip / transfer no.)</span><input v-model="ref_no" /></label>
      <p class="small muted" style="margin: 0">Recorded as a Payment Entry in Accounting against this invoice.</p>
    </form>
    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton type="submit" form="pay-form" :loading="busy">Record {{ money(amount, currency) }}</UiButton>
    </template>
  </UiModal>
</template>
