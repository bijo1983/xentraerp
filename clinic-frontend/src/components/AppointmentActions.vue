<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { clinic } from '@/lib/api'
import { nextActions } from '@/lib/appointments'
import type { Appointment, Encounter } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ appointment: Appointment; compact?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()
const store = useClinicStore()
const router = useRouter()
const toast = useToast()
const busy = ref('')
const actions = computed(() =>
  nextActions(props.appointment.status).filter((a) => (a.status === 'start' ? store.can('chart') || !!props.appointment.encounter : store.can('appointments'))),
)

async function run(status: string) {
  busy.value = status
  try {
    if (status === 'start') {
      const enc = await clinic<Encounter>('start_encounter', { appointment: props.appointment.name })
      router.push({ name: 'encounter', params: { id: enc.name } })
      return
    }
    await clinic('set_appointment_status', { name: props.appointment.name, status })
    toast.success(`${props.appointment.patient_name}: ${status}`)
    emit('changed')
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
