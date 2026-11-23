<script setup lang="ts">
// Token slip for a checked-in patient, sized for an 80 mm receipt printer (prints fine on A4 too).
import { nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Printer } from 'lucide-vue-next'
import { errorMessage, flow } from '@/lib/api'
import { niceDate } from '@/lib/format'
import { tokenLabel } from '@/lib/flow'
import type { TokenTicket } from '@/lib/types'
import UiButton from '@/ui/UiButton.vue'
import UiBanner from '@/ui/UiBanner.vue'

const route = useRoute()
const t = ref<TokenTicket | null>(null)
const error = ref('')
const doPrint = () => window.print()

onMounted(async () => {
  try {
    t.value = await flow<TokenTicket>('token_ticket', { name: route.params.id })
    document.title = `Token ${tokenLabel(t.value.token)}`
    await nextTick()
    if (route.query.auto) window.print()
  } catch (e) {
    error.value = errorMessage(e)
  }
})
</script>

<template>
  <div class="wrap">
    <div class="no-print bar"><UiButton @click="doPrint"><Printer :size="16" /> Print token</UiButton></div>
    <UiBanner v-if="error" tone="danger" class="no-print">{{ error }}</UiBanner>
    <article v-if="t" class="slip">
      <div class="clinic">{{ t.clinic }}</div>
      <div v-if="t.phone" class="small">Tel {{ t.phone }}</div>
      <div class="rule" />
      <div class="lbl">Your token</div>
      <div class="num tabular">{{ tokenLabel(t.token) }}</div>
      <div v-if="t.priority !== 'Routine'" class="prio">{{ t.priority }}</div>
      <div class="rule" />
      <dl>
        <dt>Patient</dt><dd>{{ t.patient }} <span class="small">({{ t.patient_id }})</span></dd>
        <dt>Doctor</dt><dd>{{ t.practitioner }}</dd>
        <dt v-if="t.appointment_type">Visit</dt><dd v-if="t.appointment_type">{{ t.appointment_type }}{{ t.walk_in ? ' · walk-in' : '' }}</dd>
        <dt>Date</dt><dd>{{ niceDate(t.date) }} {{ (t.checked_in_at || '').slice(11, 16) }}</dd>
      </dl>
      <div class="rule" />
      <div class="ahead">{{ t.ahead ? `${t.ahead} ${t.ahead === 1 ? 'patient' : 'patients'} ahead of you` : 'You are next' }}</div>
      <div class="small">Please wait to be called for your vitals check. Keep this slip until you pay.</div>
    </article>
  </div>
</template>

<style scoped>
.wrap { min-height: 100dvh; background: var(--x-bg); display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 16px; }
.slip { width: 80mm; max-width: 100%; background: #fff; color: #000; padding: 6mm 5mm; text-align: center; font-family: var(--x-font-sans); box-shadow: var(--x-shadow-md); border-radius: 6px; }
.clinic { font-weight: 800; font-size: 16px; }
.rule { border-top: 1px dashed #000; margin: 10px 0; }
.lbl { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; font-weight: 700; }
.num { font-family: var(--x-font-display); font-size: 64px; line-height: 1; font-weight: 800; letter-spacing: 0.02em; margin: 4px 0; }
.prio { display: inline-block; border: 2px solid #000; padding: 2px 10px; font-weight: 800; text-transform: uppercase; font-size: 12px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; text-align: start; margin: 0; font-size: 12.5px; }
dt { font-weight: 700; }
dd { margin: 0; }
.ahead { font-weight: 700; margin-bottom: 4px; }
.small { font-size: 11px; }
@media print {
  @page { size: 80mm auto; margin: 0; }
  .wrap { padding: 0; background: #fff; display: block; min-height: 0; }
  .slip { box-shadow: none; border-radius: 0; width: 80mm; }
}
</style>
