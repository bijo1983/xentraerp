<script setup lang="ts">
// Walk-in: a patient with no booking. Registers the visit for now, checks them in and issues the token.
import { reactive, ref, watch } from 'vue'
import { errorMessage, flow } from '@/lib/api'
import { PRIORITIES } from '@/lib/flow'
import type { PatientRow, Priority, TokenTicket } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiModal from '@/ui/UiModal.vue'
import UiButton from '@/ui/UiButton.vue'
import UiBanner from '@/ui/UiBanner.vue'
import PatientPicker from '@/components/PatientPicker.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', t: TokenTicket): void }>()
const store = useClinicStore()
const patient = ref<PatientRow | null>(null)
const form = reactive({ practitioner: '', appointment_type: '', priority: 'Routine' as Priority, notes: '' })
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (o) => {
    if (!o) return
    patient.value = null
    error.value = ''
    Object.assign(form, {
      practitioner: store.ctx?.practitioners[0]?.name || '',
      appointment_type: store.ctx?.appointment_types[0]?.name || '',
      priority: 'Routine',
      notes: '',
    })
  },
)

async function save() {
  if (!patient.value) {
    error.value = 'Find the patient, or register them first.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    emit('done', await flow<TokenTicket>('walk_in', { patient: patient.value.name, ...form }))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal :open="open" title="Walk-in patient" size="md" @close="emit('close')">
    <form id="walkin-form" class="stack" @submit.prevent="save">
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <PatientPicker v-model="patient" />
      <div class="grid grid-2">
        <label class="f"><span>Doctor</span>
          <select v-model="form.practitioner" required>
            <option v-for="p in store.ctx?.practitioners || []" :key="p.name" :value="p.name">{{ p.practitioner_name }}{{ p.specialty ? ` — ${p.specialty}` : '' }}</option>
          </select>
        </label>
        <label class="f"><span>Visit type</span>
          <select v-model="form.appointment_type">
            <option v-for="t in store.ctx?.appointment_types || []" :key="t.name" :value="t.name">{{ t.name }}</option>
          </select>
        </label>
      </div>
      <div class="f">
        <span>Priority</span>
        <div class="row" role="radiogroup" aria-label="Priority">
          <button v-for="p in PRIORITIES" :key="p" type="button" role="radio" :aria-checked="form.priority === p" class="chip" :class="{ on: form.priority === p, [`prio-${p}`]: true }" @click="form.priority = p">{{ p }}</button>
        </div>
      </div>
      <label class="f"><span>Reason for visit</span><textarea v-model="form.notes" rows="2" placeholder="e.g. fever since 2 days" /></label>
    </form>
    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton type="submit" form="walkin-form" :loading="busy">Check in &amp; issue token</UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.prio-Urgent.on { background: var(--x-warning-soft); border-color: var(--x-warning); color: var(--x-warning-text); }
.prio-Emergency.on { background: var(--x-danger-soft); border-color: var(--x-danger); color: var(--x-danger-text); }
</style>
