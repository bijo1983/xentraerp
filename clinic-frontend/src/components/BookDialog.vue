<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { clinic, errorMessage } from '@/lib/api'
import { isoDate, slots } from '@/lib/format'
import type { Appointment, PatientRow } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiModal from '@/ui/UiModal.vue'
import UiButton from '@/ui/UiButton.vue'
import UiBanner from '@/ui/UiBanner.vue'
import PatientPicker from '@/components/PatientPicker.vue'

const props = defineProps<{ open: boolean; date?: string; time?: string; practitioner?: string; patient?: PatientRow | null; appointment?: Appointment | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', a: Appointment): void }>()
const store = useClinicStore()
const form = reactive({ name: '', practitioner: '', appointment_type: '', appointment_date: '', appointment_time: '', duration: 15, notes: '', source: 'Phone' })
const patient = ref<PatientRow | null>(null)
const busy = ref(false)
const error = ref('')
const timeOptions = computed(() =>
  slots((store.settings?.opening_time || '09:00').slice(0, 5), (store.settings?.closing_time || '21:00').slice(0, 5), store.settings?.slot_minutes || 15),
)

watch(
  () => props.open,
  (o) => {
    if (!o) return
    error.value = ''
    const a = props.appointment
    const types = store.ctx?.appointment_types || []
    Object.assign(form, {
      name: a?.name || '',
      practitioner: a?.practitioner || props.practitioner || store.ctx?.practitioner || store.ctx?.practitioners[0]?.name || '',
      appointment_type: a?.appointment_type || types[0]?.name || '',
      appointment_date: a?.appointment_date || props.date || isoDate(),
      appointment_time: (a?.appointment_time || props.time || '').slice(0, 5),
      duration: a?.duration || types[0]?.minutes || store.settings?.slot_minutes || 15,
      notes: a?.notes || '',
      source: a?.source || 'Phone',
    })
    patient.value = a ? { name: a.patient, patient_name: a.patient_name } : props.patient || null
  },
)
watch(
  () => form.appointment_type,
  (t) => {
    const m = store.ctx?.appointment_types.find((x) => x.name === t)?.minutes
    if (m && !form.name) form.duration = m
  },
)

async function save() {
  if (!patient.value) {
    error.value = 'Choose or register the patient.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const a = await clinic<Appointment>('book_appointment', { data: { ...form, patient: patient.value.name, name: form.name || undefined } })
    emit('saved', a)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal :open="open" :title="form.name ? 'Move appointment' : 'Book appointment'" size="md" @close="emit('close')">
    <form id="book-form" class="stack" @submit.prevent="save">
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <PatientPicker v-model="patient" />
      <div class="grid grid-2">
        <label class="f"><span>Practitioner</span>
          <select v-model="form.practitioner" required>
            <option v-for="p in store.ctx?.practitioners || []" :key="p.name" :value="p.name">{{ p.practitioner_name }}{{ p.specialty ? ` — ${p.specialty}` : '' }}</option>
          </select>
        </label>
        <label class="f"><span>Visit type</span>
          <select v-model="form.appointment_type">
            <option v-for="t in store.ctx?.appointment_types || []" :key="t.name" :value="t.name">{{ t.name }} ({{ t.minutes }} min)</option>
          </select>
        </label>
        <label class="f"><span>Date</span><input v-model="form.appointment_date" type="date" required /></label>
        <label class="f"><span>Time</span>
          <select v-model="form.appointment_time" required>
            <option value="" disabled>Choose a time</option>
            <option v-for="s in timeOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <label class="f"><span>Duration (min)</span><input v-model.number="form.duration" type="number" min="5" step="5" /></label>
        <label class="f"><span>Booked via</span><select v-model="form.source"><option>Phone</option><option>Walk-in</option><option>Online</option><option>Referral</option></select></label>
      </div>
      <label class="f"><span>Notes</span><textarea v-model="form.notes" placeholder="Reason for visit, referral, …" /></label>
    </form>
    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton type="submit" form="book-form" :loading="busy">{{ form.name ? 'Save' : 'Book' }}</UiButton>
    </template>
  </UiModal>
</template>
