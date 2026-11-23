<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { clinic, errorMessage } from '@/lib/api'
import type { Policy } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import UiModal from '@/ui/UiModal.vue'
import UiButton from '@/ui/UiButton.vue'
import UiInput from '@/ui/UiInput.vue'
import UiBanner from '@/ui/UiBanner.vue'

const props = defineProps<{ open: boolean; patient: string; policy?: Policy | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()
const store = useClinicStore()
const form = reactive<Policy & { name?: string }>({ payer: '', policy_no: '' })
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (o) => {
    if (!o) return
    error.value = ''
    const p = props.policy
    Object.assign(form, {
      name: p?.name || '', payer: p?.payer || store.ctx?.payers[0]?.name || '', policy_no: p?.policy_no || '', member_id: p?.member_id || '',
      plan_name: p?.plan_name || '', coverage_pct: p?.coverage_pct ?? store.ctx?.payers[0]?.default_coverage ?? 80, copay_cap: p?.copay_cap || 0,
      valid_from: p?.valid_from || '', valid_to: p?.valid_to || '', preauth_required: p?.preauth_required || 0, active: p?.active ?? 1,
    })
  },
)
watch(
  () => form.payer,
  (v) => {
    if (!form.name) {
      const d = store.ctx?.payers.find((x) => x.name === v)?.default_coverage
      if (d != null) form.coverage_pct = d
    }
  },
)
async function save() {
  busy.value = true
  error.value = ''
  try {
    await clinic('save_policy', { data: { ...form, patient: props.patient, name: form.name || undefined } })
    emit('saved')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiModal :open="open" :title="form.name ? 'Edit insurance policy' : 'Add insurance policy'" @close="emit('close')">
    <form id="policy-form" class="stack" @submit.prevent="save">
      <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
      <UiBanner v-if="!store.ctx?.payers.length" tone="warning">Add insurers first in Insurance claims → Insurers.</UiBanner>
      <div class="grid grid-2">
        <label class="f"><span>Insurer / TPA</span>
          <select v-model="form.payer" required><option v-for="p in store.ctx?.payers || []" :key="p.name" :value="p.name">{{ p.name }}</option></select>
        </label>
        <UiInput v-model="form.policy_no" label="Policy / card no." required />
        <UiInput v-model="form.member_id" label="Member ID" />
        <UiInput v-model="form.plan_name" label="Plan / network" />
        <label class="f"><span>Insurer covers (%)</span><input v-model.number="form.coverage_pct" type="number" min="0" max="100" step="1" /></label>
        <label class="f"><span>Patient co-pay cap per visit</span><input v-model.number="form.copay_cap" type="number" min="0" step="0.01" /><span class="unit">0 = no cap</span></label>
        <label class="f"><span>Valid from</span><input v-model="form.valid_from" type="date" /></label>
        <label class="f"><span>Valid to</span><input v-model="form.valid_to" type="date" /></label>
      </div>
      <div class="row">
        <label class="check"><input v-model="form.preauth_required" type="checkbox" :true-value="1" :false-value="0" /> Pre-authorisation required</label>
        <label class="check"><input v-model="form.active" type="checkbox" :true-value="1" :false-value="0" /> Active</label>
      </div>
    </form>
    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">Cancel</UiButton>
      <UiButton type="submit" form="policy-form" :loading="busy">Save policy</UiButton>
    </template>
  </UiModal>
</template>
