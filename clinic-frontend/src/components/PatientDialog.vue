<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { clinic, errorMessage } from '@/lib/api'
import type { Patient } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiModal from '@/ui/UiModal.vue'
import UiButton from '@/ui/UiButton.vue'
import UiInput from '@/ui/UiInput.vue'
import UiBanner from '@/ui/UiBanner.vue'

const props = defineProps<{ open: boolean; patient?: Partial<Patient> | null; initialName?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', p: Patient): void }>()
const store = useClinicStore()
const blank = () => ({
  name: '', patient_name: '', gender: '', date_of_birth: '', mobile: '', email: '', id_type: '', id_number: '', nationality: '',
  blood_group: '', allergies: '', chronic_conditions: '', tax_id: '', state_code: '', address: '',
})
const form = reactive<Record<string, string>>(blank())
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (o) => {
    if (!o) return
    Object.assign(form, blank())
    for (const [k, v] of Object.entries(props.patient || {})) if (k in form && v != null) form[k] = String(v)
    if (!form.patient_name && props.initialName) form.patient_name = props.initialName
    if (!form.id_type) form.id_type = store.ctx?.standards.id_types[0] || ''
    error.value = ''
  },
)

async function save() {
  busy.value = true
  error.value = ''
  try {
    const p = await clinic<Patient>('save_patient', { data: { ...form } })
    emit('saved', p)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal :open="open" :title="form.name ? 'Edit patient' : 'New patient'" size="lg" @close="emit('close')">
    <form id="patient-form" class="stack" @submit.prevent="save">
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <div class="grid grid-3">
        <UiInput v-model="form.patient_name" label="Full name" required autofocus />
        <label class="f"><span>Gender</span><select v-model="form.gender"><option value=""></option><option>Male</option><option>Female</option><option>Other</option></select></label>
        <label class="f"><span>Date of birth</span><input v-model="form.date_of_birth" type="date" /></label>
        <UiInput v-model="form.mobile" label="Mobile" inputmode="tel" />
        <UiInput v-model="form.email" label="Email" type="email" />
        <UiInput v-model="form.nationality" label="Nationality" />
        <label class="f"><span>ID type</span>
          <select v-model="form.id_type"><option v-for="t in store.ctx?.standards.id_types || []" :key="t">{{ t }}</option></select>
        </label>
        <UiInput v-model="form.id_number" label="ID number" />
        <label class="f"><span>Blood group</span><select v-model="form.blood_group"><option value=""></option><option v-for="b in ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']" :key="b">{{ b }}</option></select></label>
      </div>
      <div class="grid grid-2">
        <label class="f"><span>Allergies</span><textarea v-model="form.allergies" placeholder="e.g. Penicillin — rash" /></label>
        <label class="f"><span>Chronic conditions</span><textarea v-model="form.chronic_conditions" placeholder="e.g. Type 2 diabetes, hypertension" /></label>
      </div>
      <details>
        <summary class="muted small" style="cursor: pointer">Billing details (business patients{{ store.region === 'India' ? ', place of supply' : '' }})</summary>
        <div class="grid grid-3" style="margin-top: 12px">
          <UiInput v-model="form.tax_id" :label="(store.settings?.tax_id_label || 'Tax ID') + ' of patient / company'" />
          <UiInput v-if="store.region === 'India'" v-model="form.state_code" label="State code (place of supply)" hint="2 digits, e.g. 29 for Karnataka" :maxlength="2" />
          <label class="f" style="grid-column: span 2"><span>Address</span><textarea v-model="form.address" /></label>
        </div>
      </details>
    </form>
    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton type="submit" form="patient-form" :loading="busy">Save patient</UiButton>
    </template>
  </UiModal>
</template>
