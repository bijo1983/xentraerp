<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { clinic, errorMessage, flow } from '@/lib/api'
import { nextActions } from '@/lib/appointments'
import type { Appointment, Encounter, TokenTicket } from '@/lib/types'
import TokenDialog from '@/components/TokenDialog.vue'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ appointment: Appointment; compact?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()
const store = useClinicStore()
const router = useRouter()
const toast = useToast()
const busy = ref('')
const ticket = ref<TokenTicket | null>(null)
const actions = computed(() =>
  nextActions(props.appointment.status).filter((a) => (a.status === 'start' ? store.can('chart') : store.can('appointments'))),
)

async function run(status: string) {
  busy.value = status
  try {
    if (status === 'start') {
      const enc = await flow<Encounter>('call_in', { appointment: props.appointment.name })
      router.push({ name: 'encounter', params: { id: enc.name } })
      return
    }
    if (status === 'Checked In' || status === 'token') {
      // Check-in goes through the visit flow: it issues the day's token and queues the patient for triage.
      ticket.value = await flow<TokenTicket>(status === 'token' ? 'token_ticket' : 'check_in', { name: props.appointment.name })
      if (status !== 'token') emit('changed')
      return
    }
    await clinic('set_appointment_status', { name: props.appointment.name, status })
    toast.success(`${props.appointment.patient_name}: ${status}`)
    emit('changed')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="row" style="gap: 6px">
    <button
      v-for="a in compact ? actions.slice(0, 2) : actions"
      :key="a.status"
      type="button"
      class="act"
      :class="a.tone ? `act--${a.tone}` : ''"
      :disabled="!!busy"
      @click.stop="run(a.status)"
    >
      {{ busy === a.status ? '…' : a.label }}
    </button>
    <TokenDialog :ticket="ticket" @close="ticket = null" />
  </div>
</template>

<style scoped>
.act { border: 1px solid var(--x-border); background: var(--x-surface); color: var(--x-text); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.act:hover:not(:disabled) { border-color: var(--x-border-strong); background: var(--x-surface-2); }
.act--primary { background: var(--x-primary); border-color: var(--x-primary); color: #fff; }
.act--primary:hover:not(:disabled) { background: var(--x-primary-hover); }
.act--danger { color: var(--x-danger-text); }
.act:disabled { opacity: 0.6; cursor: wait; }
</style>
