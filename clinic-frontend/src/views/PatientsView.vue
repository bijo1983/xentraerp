<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { UserPlus, Users } from 'lucide-vue-next'
import { clinic } from '@/lib/api'
import type { Patient, PatientRow } from '@/lib/types'
import UiButton from '@/ui/UiButton.vue'
import UiSearchField from '@/ui/UiSearchField.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import PatientDialog from '@/components/PatientDialog.vue'

const router = useRouter()
const q = ref('')
const rows = ref<PatientRow[]>([])
const loading = ref(true)
const creating = ref(false)
let timer: number | undefined

async function load() {
  loading.value = true
  try {
    rows.value = await clinic<PatientRow[]>('search_patients', { query: q.value, limit: 60 })
  } finally {
    loading.value = false
  }
}
watch(q, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(load, 250)
})
function saved(p: Patient) {
  creating.value = false
  router.push({ name: 'patient', params: { id: p.name } })
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Patients</h1><p>Search by name, mobile, ID number or file number.</p></div>
      <UiButton @click="creating = true"><UserPlus :size="17" /> New patient</UiButton>
    </div>
    <UiSearchField v-model="q" placeholder="Search patients" autofocus />
    <UiEmptyState v-if="!loading && !rows.length" :icon="Users" :title="q ? 'No patient matches' : 'No patients yet'" :message="q ? 'Check the spelling, or register them as a new patient.' : 'Register your first patient to start booking and charting.'">
      <UiButton @click="creating = true">Register patient</UiButton>
    </UiEmptyState>
    <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>File no.</th><th>Name</th><th>Age / sex</th><th>Mobile</th><th>ID</th><th>Alerts</th></tr></thead>
        <tbody>
          <tr v-for="p in rows" :key="p.name" class="clickable" @click="router.push({ name: 'patient', params: { id: p.name } })">
            <td class="tabular muted">{{ p.name }}</td>
            <td><strong>{{ p.patient_name }}</strong></td>
            <td>{{ p.age }} {{ p.gender?.[0] || '' }}</td>
            <td class="tabular">{{ p.mobile }}</td>
            <td class="tabular">{{ p.id_number }}</td>
            <td><span v-if="p.allergies" class="alert-strip" style="display: inline-flex">Allergy</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <PatientDialog :open="creating" @close="creating = false" @saved="saved" />
  </div>
</template>
