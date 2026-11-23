<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Trash2 } from 'lucide-vue-next'
import { clinic, errorMessage } from '@/lib/api'
import { money } from '@/lib/format'
import type { ClinicSettings, Practitioner, Service, TaxClass } from '@/lib/types'
import { useClinicStore } from '@/stores/clinic'
import { useToast } from '@/composables/useToast'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiInput from '@/ui/UiInput.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiModal from '@/ui/UiModal.vue'
import UiStatusBadge from '@/ui/UiStatusBadge.vue'

type Tab = 'clinic' | 'tax' | 'clinical' | 'services' | 'practitioners' | 'staff'
const TABS: [Tab, string][] = [['clinic', 'Clinic'], ['tax', 'Tax & invoices'], ['clinical', 'Charting & visits'], ['services', 'Services & prices'], ['practitioners', 'Practitioners'], ['staff', 'Staff & users']]
const CLASSES: [TaxClass, string, string][] = [
  ['healthcare', 'Medical services', 'Consultations, procedures, diagnostics'],
  ['cosmetic', 'Cosmetic / elective', 'Aesthetic treatments, whitening, laser'],
  ['medicine', 'Medicines', 'Dispensed medicines'],
  ['goods', 'Goods', 'Consumables, spectacles, devices'],
]
const ROLES = ['Clinic Manager', 'Clinic Practitioner', 'Clinic Receptionist', 'Clinic Billing']

const store = useClinicStore()
const route = useRoute()
const toast = useToast()
const tab = ref<Tab>((route.query.tab as Tab) || (store.ctx?.configured ? 'clinic' : 'clinic'))
const s = reactive<Partial<ClinicSettings>>({})
const classRates = reactive<Record<TaxClass, string>>({ healthcare: '', cosmetic: '', medicine: '', goods: '' })
const apptTypes = ref<{ name: string; minutes: number }[]>([])
const templates = ref<string[]>([])
const busy = ref('')
const error = ref('')
const svcForm = ref<(Partial<Service> & { disabled?: number }) | null>(null)
const pracForm = ref<Partial<Practitioner> & { disabled?: number } | null>(null)
const staff = ref<{ staff: { user: string; full_name: string; enabled: number; roles: string[] }[]; max_users: number; active_users: number } | null>(null)
const staffForm = ref<{ email: string; full_name: string; role: string; password: string; practitioner: boolean; specialty: string; registration_no: string } | null>(null)
const chosenType = ref(store.settings?.clinic_type || '')

const typeInfo = computed(() => store.ctx?.catalog.clinic_types.find((c) => c.code === chosenType.value))
const allTemplates = computed(() => store.ctx?.catalog.templates || {})

function fill() {
  const st = store.settings
  if (!st) return
  Object.assign(s, JSON.parse(JSON.stringify(st)))
  for (const [c] of CLASSES) {
    const v = st.tax_classes?.[c]
    classRates[c] = v === 'exempt' || v == null ? 'exempt' : String(v)
  }
  apptTypes.value = JSON.parse(JSON.stringify(store.ctx?.appointment_types || []))
  templates.value = [...(st.enabled_templates || [])]
  chosenType.value = st.clinic_type || ''
}

async function applyType() {
  if (!chosenType.value) return
  busy.value = 'type'
  error.value = ''
  try {
    await clinic('apply_clinic_type', { clinic_type: chosenType.value })
    await store.load()
    fill()
    toast.success(`${typeInfo.value?.label}: templates, visit types and services added`)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}

async function save(part: string) {
  busy.value = part
  error.value = ''
  try {
    const data: Record<string, unknown> = {}
    if (part === 'clinic') Object.assign(data, { clinic_name: s.clinic_name, licence_no: s.licence_no, phone: s.phone, email: s.email, address: s.address, footer_note: s.footer_note })
    if (part === 'tax') {
      Object.assign(data, { tax_regime: s.tax_regime, tax_id: s.tax_id, tax_id_label: s.tax_id_label, standard_rate: s.standard_rate, state_code: s.state_code, arabic_invoice: s.arabic_invoice ? 1 : 0 })
      data.tax_classes = Object.fromEntries(CLASSES.map(([c]) => [c, classRates[c] === 'exempt' || classRates[c] === '' ? 'exempt' : Number(classRates[c])]))
    }
    if (part === 'clinical') Object.assign(data, { enabled_templates: templates.value, appointment_types: apptTypes.value, slot_minutes: s.slot_minutes, opening_time: s.opening_time, closing_time: s.closing_time })
    await clinic('save_settings', { data })
    await store.load()
    fill()
    toast.success('Saved')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}

async function saveService() {
  busy.value = 'svc'
  error.value = ''
  try {
    await clinic('save_service', { data: svcForm.value })
    svcForm.value = null
    await store.load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function savePractitioner() {
  busy.value = 'prac'
  error.value = ''
  try {
    await clinic('save_practitioner', { data: pracForm.value })
    pracForm.value = null
    await store.load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function loadStaff() {
  if (store.can('staff')) staff.value = await clinic('list_staff')
}
async function saveStaff() {
  if (!staffForm.value) return
  busy.value = 'staff'
  error.value = ''
  try {
    const f = staffForm.value
    staff.value = await clinic('create_staff', { ...f, practitioner: f.practitioner ? 1 : 0, password: f.password || undefined })
    staffForm.value = null
    await store.load()
    toast.success('Staff member added')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
const limitReached = computed(() => !!staff.value && staff.value.max_users > 0 && staff.value.active_users >= staff.value.max_users)
watch(tab, (t) => {
  error.value = ''
  if (t === 'staff') loadStaff()
})
onMounted(() => {
  fill()
  if (tab.value === 'staff') loadStaff()
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Setup</h1><p>{{ store.settings?.clinic_name }} · {{ store.settings?.country }} · {{ store.region }} standards</p></div>
    </div>
    <div class="tabs">
      <button v-for="[k, l] in TABS" :key="k" type="button" class="tab" :class="{ on: tab === k }" @click="tab = k">{{ l }}</button>
    </div>
    <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>

    <!-- Clinic -->
    <template v-if="tab === 'clinic'">
      <UiCard title="Clinic type">
        <p class="muted" style="margin-top: 0">Your clinic type decides the charting templates, visit types and starter services. Applying a type only adds — nothing you already use is removed.</p>
        <div class="types">
          <button v-for="c in store.ctx?.catalog.clinic_types || []" :key="c.code" type="button" class="type" :class="{ on: chosenType === c.code }" @click="chosenType = c.code">
            <strong>{{ c.label }}</strong>
            <span class="small muted">{{ c.templates.map((t) => allTemplates[t]?.label || t).join(' · ') }}</span>
            <UiStatusBadge v-if="store.settings?.clinic_type === c.code" tone="success" size="sm">Current</UiStatusBadge>
          </button>
        </div>
        <div class="row" style="margin-top: 14px">
          <UiButton :loading="busy === 'type'" :disabled="!chosenType" @click="applyType">{{ store.settings?.configured ? 'Apply clinic type' : 'Set up my clinic' }}</UiButton>
          <span v-if="typeInfo" class="small muted">Visit types: {{ typeInfo.appointment_types.map((a) => a.name).join(', ') }}</span>
        </div>
      </UiCard>
      <UiCard title="Clinic details (printed on every document)">
        <div class="grid grid-2">
          <UiInput v-model="s.clinic_name" label="Clinic name" />
          <UiInput v-model="s.licence_no" :label="store.region === 'India' ? 'Clinical establishment reg. no.' : 'Facility licence no.'" :hint="store.region === 'GCC' ? 'e.g. DHA / DOH / MOH facility licence' : undefined" />
          <UiInput v-model="s.phone" label="Phone" />
          <UiInput v-model="s.email" label="Email" type="email" />
          <label class="f"><span>Address</span><textarea v-model="s.address" /></label>
          <label class="f"><span>Document footer</span><textarea v-model="s.footer_note" placeholder="e.g. Thank you for choosing us. Bank details…" /></label>
        </div>
        <div class="row" style="margin-top: 14px"><UiButton :loading="busy === 'clinic'" @click="save('clinic')">Save details</UiButton></div>
      </UiCard>
    </template>

    <!-- Tax -->
    <UiCard v-else-if="tab === 'tax'" title="Tax registration and rates">
      <UiBanner tone="info">
        Preconfigured for {{ s.country }}:
        <template v-if="store.region === 'GCC'"> {{ s.tax_regime === 'VAT' ? `VAT ${s.standard_rate}%` : 'no VAT in force' }} — GCC tax invoice layout{{ s.arabic_invoice ? ', bilingual Arabic/English' : '' }}{{ s.country === 'Saudi Arabia' ? ', ZATCA QR code on every invoice' : '' }}.</template>
        <template v-else-if="store.region === 'India'"> GST — Tax Invoice / Bill of Supply with GSTIN, HSN/SAC, place of supply and CGST + SGST (same state) or IGST (other state). Healthcare services by a clinical establishment are exempt.</template>
        <template v-else-if="store.region === 'Europe'"> VAT {{ s.standard_rate }}% — medical care exempt under Art. 132 of the VAT Directive, with the exemption reason printed.</template>
        <template v-else> no tax preset for this country; set it here.</template>
        Check these with your tax adviser.
      </UiBanner>
      <div class="grid grid-3" style="margin-top: 14px">
        <label class="f"><span>Tax system</span><select v-model="s.tax_regime"><option>VAT</option><option>GST</option><option>None</option></select></label>
        <UiInput v-model="s.tax_id" :label="s.tax_id_label || 'Tax registration no.'" :hint="s.tax_regime === 'GST' ? '15-character GSTIN' : s.country === 'Saudi Arabia' ? '15-digit VAT number (needed for the QR code)' : undefined" />
        <UiInput v-model="s.tax_id_label" label="Label printed for it" />
        <label class="f"><span>Standard rate (%)</span><input v-model.number="s.standard_rate" type="number" min="0" max="50" step="0.1" /></label>
        <UiInput v-if="s.tax_regime === 'GST'" v-model="s.state_code" label="Clinic state code" hint="From your GSTIN, e.g. 29" :maxlength="2" />
        <label v-if="store.region === 'GCC'" class="check" style="align-self: end"><input v-model="s.arabic_invoice" type="checkbox" :true-value="1" :false-value="0" /> Bilingual (Arabic) documents</label>
      </div>
      <h3 style="margin: 20px 0 10px">Rate by kind of charge</h3>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Kind</th><th>Includes</th><th>Treatment</th></tr></thead>
          <tbody>
            <tr v-for="[c, l, d] in CLASSES" :key="c">
              <td><strong>{{ l }}</strong></td>
              <td class="muted">{{ d }}</td>
              <td>
                <div class="row">
                  <select class="ctl" style="width: 150px" :value="classRates[c] === 'exempt' ? 'exempt' : 'rate'" @change="classRates[c] = ($event.target as HTMLSelectElement).value === 'exempt' ? 'exempt' : String(s.standard_rate || 0)">
                    <option value="exempt">Exempt</option><option value="rate">Taxable at</option>
                  </select>
                  <input v-if="classRates[c] !== 'exempt'" v-model="classRates[c]" type="number" min="0" max="50" step="0.1" class="ctl" style="width: 100px" aria-label="Rate %" />
                  <span v-if="classRates[c] !== 'exempt'" class="small muted">% {{ Number(classRates[c]) === 0 ? '(zero-rated)' : '' }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">Saving updates the tax accounts and templates in Accounting ({{ s.tax_regime === 'GST' ? 'Output CGST / SGST / IGST' : 'Output VAT' }}). Existing invoices are not changed.</p>
      <UiButton :loading="busy === 'tax'" @click="save('tax')">Save tax settings</UiButton>
    </UiCard>

    <!-- Charting & visits -->
    <template v-else-if="tab === 'clinical'">
      <UiCard title="Charting templates">
        <div class="types">
          <label v-for="(t, k) in allTemplates" :key="k" class="type check" :class="{ on: templates.includes(k as string) }">
            <input v-model="templates" type="checkbox" :value="k" />
            <strong>{{ t.label }}</strong>
          </label>
        </div>
      </UiCard>
      <UiCard title="Visit types & hours">
        <div class="grid grid-3">
          <label class="f"><span>Opens</span><input v-model="s.opening_time" type="time" /></label>
          <label class="f"><span>Closes</span><input v-model="s.closing_time" type="time" /></label>
          <label class="f"><span>Calendar slot (min)</span><input v-model.number="s.slot_minutes" type="number" min="5" step="5" /></label>
        </div>
        <div class="stack" style="margin-top: 14px">
          <div v-for="(a, i) in apptTypes" :key="i" class="row">
            <input v-model="a.name" class="ctl grow" aria-label="Visit type" />
            <input v-model.number="a.minutes" type="number" min="5" step="5" class="ctl" style="width: 100px" aria-label="Minutes" />
            <span class="small muted">min</span>
            <button type="button" class="chip" aria-label="Remove" @click="apptTypes.splice(i, 1)"><Trash2 :size="14" /></button>
          </div>
          <div><button type="button" class="chip" @click="apptTypes.push({ name: '', minutes: 15 })"><Plus :size="14" /> Add visit type</button></div>
        </div>
        <div class="row" style="margin-top: 14px"><UiButton :loading="busy === 'clinical'" @click="save('clinical')">Save</UiButton></div>
      </UiCard>
    </template>

    <!-- Services -->
    <UiCard v-else-if="tab === 'services'" title="Services, medicines & prices" :padded="false">
      <template #actions><UiButton size="sm" @click="svcForm = { category: 'Service', tax_class: 'healthcare', rate: 0 }"><Plus :size="15" /> Add</UiButton></template>
      <div class="tbl-wrap" style="border: 0">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Kind</th><th>Code</th><th>Tax</th><th class="right">Price</th></tr></thead>
          <tbody>
            <tr v-for="x in store.ctx?.services || []" :key="x.name" class="clickable" @click="svcForm = { ...x }">
              <td><strong>{{ x.name }}</strong></td><td>{{ x.category }}</td><td class="tabular">{{ x.code }}</td>
              <td>{{ CLASSES.find((c) => c[0] === x.tax_class)?.[1] }}</td>
              <td class="right tabular">{{ money(x.rate, store.currency) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <!-- Practitioners -->
    <UiCard v-else-if="tab === 'practitioners'" title="Practitioners" :padded="false">
      <template #actions><UiButton size="sm" @click="pracForm = { slot_minutes: s.slot_minutes || 15, color: '#0d9488' }"><Plus :size="15" /> Add</UiButton></template>
      <div class="tbl-wrap" style="border: 0">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Specialty</th><th>Licence no.</th><th>Sign-in</th></tr></thead>
          <tbody>
            <tr v-for="p in store.ctx?.practitioners || []" :key="p.name" class="clickable" @click="pracForm = { ...p }">
              <td><span class="dot" :style="{ background: p.color || 'var(--x-primary)' }" /> <strong>{{ p.practitioner_name }}</strong></td>
              <td>{{ p.specialty }}</td><td class="tabular">{{ p.registration_no }}</td><td class="small muted">{{ p.user || '—' }}</td>
            </tr>
            <tr v-if="!store.ctx?.practitioners.length"><td colspan="4" class="empty-row">Add the doctors, dentists and therapists who see patients.</td></tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <!-- Staff -->
    <UiCard v-else-if="tab === 'staff'" title="Staff & users" :padded="false">
      <template #actions><UiButton size="sm" :disabled="limitReached" @click="staffForm = { email: '', full_name: '', role: 'Clinic Receptionist', password: '', practitioner: false, specialty: '', registration_no: '' }"><Plus :size="15" /> Add staff</UiButton></template>
      <div style="padding: 0 20px 12px" class="small muted">
        {{ staff?.active_users ?? '…' }} active users ·
        <template v-if="staff && staff.max_users > 0">your plan allows {{ staff.max_users }}</template><template v-else>unlimited users on your plan</template>
      </div>
      <div class="tbl-wrap" style="border: 0">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Clinic roles</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="u in staff?.staff || []" :key="u.user">
              <td><strong>{{ u.full_name }}</strong></td><td>{{ u.user }}</td><td>{{ u.roles.map((r) => r.replace('Clinic ', '')).join(', ') }}</td>
              <td><UiStatusBadge :tone="u.enabled ? 'success' : 'neutral'" size="sm">{{ u.enabled ? 'Active' : 'Disabled' }}</UiStatusBadge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <UiModal :open="!!svcForm" :title="svcForm?.item ? svcForm.name : 'Add service'" @close="svcForm = null">
      <form v-if="svcForm" id="svc-form" class="grid grid-2" @submit.prevent="saveService">
        <UiInput v-model="svcForm.name" label="Name" required :disabled="!!svcForm.item" />
        <label class="f"><span>Kind</span><select v-model="svcForm.category" :disabled="!!svcForm.item"><option>Service</option><option>Medicine</option><option>Consumable</option></select></label>
        <label class="f"><span>Price</span><input v-model.number="svcForm.rate" type="number" min="0" step="0.001" /></label>
        <label class="f"><span>Tax treatment</span><select v-model="svcForm.tax_class"><option v-for="[c, l] in CLASSES" :key="c" :value="c">{{ l }}</option></select></label>
        <UiInput v-model="svcForm.code" :label="store.region === 'India' ? 'SAC / HSN code' : 'Service code (CPT / tariff)'" />
        <label v-if="svcForm.item" class="check" style="align-self: end"><input v-model="svcForm.disabled" type="checkbox" :true-value="1" :false-value="0" /> Disabled</label>
      </form>
      <template #footer>
        <UiButton variant="secondary" @click="svcForm = null">Cancel</UiButton>
        <UiButton type="submit" form="svc-form" :loading="busy === 'svc'">Save</UiButton>
      </template>
    </UiModal>

    <UiModal :open="!!pracForm" :title="pracForm?.name ? pracForm.practitioner_name : 'Add practitioner'" @close="pracForm = null">
      <form v-if="pracForm" id="prac-form" class="grid grid-2" @submit.prevent="savePractitioner">
        <UiInput v-model="pracForm.practitioner_name" label="Name" required />
        <UiInput v-model="pracForm.specialty" label="Specialty" />
        <UiInput v-model="pracForm.registration_no" :label="store.region === 'India' ? 'NMC / state council reg. no.' : store.region === 'GCC' ? 'Professional licence no. (DHA/DOH/MOH/SCFHS)' : 'Registration no.'" />
        <UiInput v-model="pracForm.qualification" label="Qualification" hint="e.g. MBBS, MD" />
        <UiInput v-model="pracForm.user" label="Sign-in email (optional)" type="email" hint="Links the practitioner to a staff user" />
        <label class="f"><span>Slot (min)</span><input v-model.number="pracForm.slot_minutes" type="number" min="5" step="5" /></label>
        <label class="f"><span>Calendar colour</span><input v-model="pracForm.color" type="color" style="min-height: 40px" /></label>
        <label v-if="pracForm.name" class="check" style="align-self: end"><input v-model="pracForm.disabled" type="checkbox" :true-value="1" :false-value="0" /> Disabled</label>
      </form>
      <template #footer>
        <UiButton variant="secondary" @click="pracForm = null">Cancel</UiButton>
        <UiButton type="submit" form="prac-form" :loading="busy === 'prac'">Save</UiButton>
      </template>
    </UiModal>

    <UiModal :open="!!staffForm" title="Add staff member" @close="staffForm = null">
      <form v-if="staffForm" id="staff-form" class="stack" @submit.prevent="saveStaff">
        <UiBanner v-if="error" tone="danger">{{ error }}</UiBanner>
        <div class="grid grid-2">
          <UiInput v-model="staffForm.full_name" label="Full name" required />
          <UiInput v-model="staffForm.email" label="Email (sign-in)" type="email" required />
          <label class="f"><span>Role</span><select v-model="staffForm.role"><option v-for="r in ROLES" :key="r" :value="r">{{ r.replace('Clinic ', '') }}</option></select></label>
          <UiInput v-model="staffForm.password" label="Initial password" type="password" hint="Leave empty to send a welcome email instead" />
        </div>
        <label class="check"><input v-model="staffForm.practitioner" type="checkbox" /> Sees patients (create a practitioner calendar)</label>
        <div v-if="staffForm.practitioner" class="grid grid-2">
          <UiInput v-model="staffForm.specialty" label="Specialty" />
          <UiInput v-model="staffForm.registration_no" label="Licence / registration no." />
        </div>
      </form>
      <template #footer>
        <UiButton variant="secondary" @click="staffForm = null">Cancel</UiButton>
        <UiButton type="submit" form="staff-form" :loading="busy === 'staff'">Add</UiButton>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.types { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.type { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: start; font: inherit; color: var(--x-text); padding: 14px; border-radius: var(--x-radius-md); border: 1px solid var(--x-border); background: var(--x-surface); cursor: pointer; }
.type.check { flex-direction: row; align-items: center; }
.type:hover { border-color: var(--x-border-strong); }
.type.on { border-color: var(--x-primary); background: var(--x-primary-soft); box-shadow: var(--x-focus-ring); }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: 6px; }
</style>
