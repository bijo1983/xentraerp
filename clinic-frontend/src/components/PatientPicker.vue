<script setup lang="ts">
import { ref, watch } from 'vue'
import { UserPlus } from 'lucide-vue-next'
import { clinic } from '@/lib/api'
import type { Patient, PatientRow } from '@/lib/types'
import UiSearchField from '@/ui/UiSearchField.vue'
import PatientDialog from '@/components/PatientDialog.vue'

const props = defineProps<{ modelValue: PatientRow | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', p: PatientRow | null): void }>()
const q = ref('')
const results = ref<PatientRow[]>([])
const creating = ref(false)
let timer: number | undefined

watch(q, (v) => {
  window.clearTimeout(timer)
  if (!v.trim()) {
    results.value = []
    return
  }
  timer = window.setTimeout(async () => {
    results.value = await clinic<PatientRow[]>('search_patients', { query: v, limit: 8 }).catch(() => [])
  }, 220)
})

function pick(p: PatientRow) {
  emit('update:modelValue', p)
  q.value = ''
  results.value = []
}
function created(p: Patient) {
  creating.value = false
  pick(p)
}
</script>

<template>
  <div class="pp">
    <div v-if="props.modelValue" class="pp__chosen">
      <div>
        <strong>{{ props.modelValue.patient_name }}</strong>
        <div class="small muted">{{ props.modelValue.name }} · {{ props.modelValue.mobile || 'no mobile' }}</div>
      </div>
      <button type="button" class="chip" @click="emit('update:modelValue', null)">Change</button>
    </div>
    <template v-else>
      <UiSearchField v-model="q" placeholder="Search patient by name, mobile, ID or file no." />
      <ul v-if="results.length || q" class="pp__list" role="listbox">
        <li v-for="r in results" :key="r.name">
          <button type="button" class="pp__opt" @click="pick(r)">
            <strong>{{ r.patient_name }}</strong>
            <span class="small muted">{{ r.name }} · {{ r.age || '' }} {{ r.gender || '' }} · {{ r.mobile || '' }}</span>
          </button>
        </li>
        <li>
          <button type="button" class="pp__opt pp__new" @click="creating = true"><UserPlus :size="16" /> Register new patient{{ q ? ` “${q}”` : '' }}</button>
        </li>
      </ul>
    </template>
    <PatientDialog :open="creating" :initial-name="q" @close="creating = false" @saved="created" />
  </div>
</template>

<style scoped>
.pp { position: relative; display: flex; flex-direction: column; gap: 6px; }
.pp__chosen { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--x-primary); background: var(--x-primary-soft); border-radius: var(--x-radius-md); }
.pp__list { list-style: none; margin: 0; padding: 4px; border: 1px solid var(--x-border); border-radius: var(--x-radius-md); background: var(--x-surface); box-shadow: var(--x-shadow-md); max-height: 280px; overflow: auto; }
.pp__opt { width: 100%; text-align: start; border: 0; background: none; font: inherit; color: var(--x-text); padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.pp__opt:hover { background: var(--x-primary-soft); }
.pp__new { flex-direction: row; align-items: center; gap: 8px; color: var(--x-primary-text); font-weight: 600; }
</style>
