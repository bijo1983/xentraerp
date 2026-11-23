<script setup lang="ts">
// Printable documents. Layout follows the clinic's region:
//  GCC    — Tax Invoice / Simplified Tax Invoice, supplier TRN/VAT no., optional Arabic, ZATCA QR (KSA)
//  India  — Tax Invoice or Bill of Supply, GSTIN, place of supply, SAC/HSN, CGST+SGST or IGST, reverse charge
//  Europe — Invoice with VAT IDs and the exemption reason for exempt medical care
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { Printer } from 'lucide-vue-next'
import { clinic, errorMessage } from '@/lib/api'
import { money, niceDate } from '@/lib/format'
import { bi } from '@/lib/print'
import UiButton from '@/ui/UiButton.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import ClinzaMark from '@/components/ClinzaMark.vue'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>
const route = useRoute()
const kind = computed(() => String(route.params.kind))
const doc = ref<Doc | null>(null)
const error = ref('')
const qr = ref('')

const ar = computed(() => !!doc.value?.clinic?.arabic && doc.value?.standard === 'GCC')
const india = computed(() => doc.value?.standard === 'India')
const cur = computed(() => doc.value?.currency || doc.value?.clinic?.currency)
const L = (key: string, en: string) => bi(key, en, ar.value)
const compNames = computed<string[]>(() => {
  const s = new Set<string>()
  for (const l of doc.value?.lines || []) for (const k of Object.keys(l.components || {})) s.add(k)
  return [...s]
})

async function load() {
  try {
    const method = kind.value === 'invoice' ? 'get_invoice_print' : kind.value === 'prescription' ? 'get_prescription_print' : 'get_claim_print'
    doc.value = await clinic<Doc>(method, { name: route.params.id })
    document.title = `${doc.value?.title || kind.value} ${route.params.id}`
    if (doc.value?.qr_tlv) qr.value = await QRCode.toDataURL(doc.value.qr_tlv, { margin: 1, width: 132, errorCorrectionLevel: 'M' })
    await nextTick()
    if (route.query.auto) window.print()
  } catch (e) {
    error.value = errorMessage(e)
  }
}
function doPrint() {
  window.print()
}
function lineTax(l: Doc, name: string) {
  return l.components?.[name]
}
onMounted(load)
</script>

<template>
  <div class="print-root">
    <div class="toolbar no-print">
      <UiButton @click="doPrint"><Printer :size="16" /> Print / save as PDF</UiButton>
      <span class="small muted">{{ doc?.standard }} format</span>
    </div>
    <UiBanner v-if="error" tone="danger" class="no-print">{{ error }}</UiBanner>
    <div v-else-if="!doc" class="sheet"><UiSkeleton :lines="10" /></div>

    <article v-else class="sheet" :lang="ar ? 'en' : undefined">
      <!-- letterhead -->
      <header class="lh">
        <div class="lh__brand">
          <img v-if="doc.clinic.logo" :src="doc.clinic.logo" alt="" class="lh__logo" />
          <ClinzaMark v-else :size="40" />
          <div>
            <div class="lh__name">{{ doc.clinic.name }}</div>
            <div class="lh__meta">{{ doc.clinic.address }}</div>
            <div class="lh__meta">
              <span v-if="doc.clinic.phone">Tel {{ doc.clinic.phone }}</span><span v-if="doc.clinic.email"> · {{ doc.clinic.email }}</span>
            </div>
            <div class="lh__meta">
              <span v-if="doc.clinic.licence_no">{{ L('licence', 'Licence no.') }} {{ doc.clinic.licence_no }}</span>
              <span v-if="doc.clinic.tax_id"> · <strong>{{ doc.clinic.tax_id_label }} {{ doc.clinic.tax_id }}</strong></span>
              <span v-if="india && doc.clinic.state_code"> · State {{ doc.clinic.state_code }}-{{ doc.clinic.state_name }}</span>
            </div>
          </div>
        </div>
        <div class="lh__title">
          <template v-if="kind === 'invoice'">
            <div class="title">{{ doc.title }}</div>
            <div v-if="doc.title_ar" class="title-ar" dir="rtl" lang="ar">{{ doc.title_ar }}</div>
          </template>
          <div v-else-if="kind === 'prescription'" class="title">{{ L('prescription', 'Prescription') }}</div>
          <div v-else class="title">{{ L('claim', 'Insurance claim') }}</div>
          <div class="tabular small">{{ kind === 'claim' ? doc.claim.name : doc.number }}</div>
        </div>
      </header>

      <!-- ============ INVOICE ============ -->
      <template v-if="kind === 'invoice'">
        <section class="blocks">
          <div class="block">
            <div class="lbl">{{ L('bill_to', 'Bill to') }}</div>
            <strong>{{ doc.bill_to.name }}</strong>
            <div v-if="doc.bill_to.tax_id">{{ india ? 'GSTIN' : L('tax_id', doc.clinic.tax_id_label || 'Tax ID') }}: {{ doc.bill_to.tax_id }}</div>
            <div v-if="doc.bill_to.id_number">{{ doc.bill_to.id_type }}: {{ doc.bill_to.id_number }}</div>
            <div v-if="doc.bill_to.mobile">{{ doc.bill_to.mobile }}</div>
            <div v-if="doc.bill_to.address" class="pre">{{ doc.bill_to.address }}</div>
          </div>
          <div v-if="doc.patient && doc.bill_to.is_insurer" class="block">
            <div class="lbl">{{ L('patient', 'Patient') }}</div>
            <strong>{{ doc.patient.patient_name }}</strong> <span class="muted">({{ doc.patient.name }})</span>
            <div v-if="doc.patient.id_number">{{ doc.patient.id_type }}: {{ doc.patient.id_number }}</div>
            <div v-if="doc.policy">{{ L('policy', 'Policy') }}: {{ doc.policy.policy_no }}<span v-if="doc.policy.member_id"> · member {{ doc.policy.member_id }}</span></div>
          </div>
          <div class="block kv">
            <div><span class="lbl">{{ L('invoice_no', 'Invoice no.') }}</span><span class="tabular">{{ doc.number }}</span></div>
            <div><span class="lbl">{{ L('date', 'Date') }}</span><span>{{ niceDate(doc.date) }} {{ doc.time?.slice(0, 5) }}</span></div>
            <div v-if="doc.due_date && doc.due_date !== doc.date"><span class="lbl">{{ L('due', 'Due') }}</span><span>{{ niceDate(doc.due_date) }}</span></div>
            <div v-if="india"><span class="lbl">Place of supply</span><span>{{ doc.place_of_supply || '—' }}</span></div>
            <div v-if="india"><span class="lbl">Reverse charge</span><span>{{ doc.reverse_charge }}</span></div>
            <div v-if="doc.practitioner"><span class="lbl">{{ L('practitioner', 'Practitioner') }}</span><span>{{ doc.practitioner.practitioner_name }}</span></div>
            <div v-if="doc.encounter"><span class="lbl">Visit</span><span class="tabular">{{ doc.encounter }}</span></div>
          </div>
        </section>

        <table class="lines">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ L('description', 'Description') }}</th>
              <th v-if="india">SAC / HSN</th>
              <th class="r">{{ L('qty', 'Qty') }}</th>
              <th class="r">{{ L('unit_price', 'Rate') }}</th>
              <th class="r">{{ india ? 'Taxable value' : L('net', 'Net amount') }}</th>
              <template v-if="india">
                <th v-for="c in compNames" :key="c" class="r">{{ c }}</th>
              </template>
              <template v-else>
                <th class="r">{{ L('vat_rate', 'VAT %') }}</th>
                <th class="r">{{ L('vat', 'VAT') }}</th>
              </template>
              <th class="r">{{ L('total', 'Total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in doc.lines" :key="i">
              <td>{{ Number(i) + 1 }}</td>
              <td>{{ l.item }}<div v-if="l.description" class="muted small">{{ l.description }}</div><div v-if="!india && l.code" class="muted small">{{ l.code }}</div></td>
              <td v-if="india" class="tabular">{{ l.code }}</td>
              <td class="r tabular">{{ l.qty }}</td>
              <td class="r tabular">{{ money(l.rate) }}</td>
              <td class="r tabular">{{ money(l.net_amount) }}</td>
              <template v-if="india">
                <td v-for="c in compNames" :key="c" class="r tabular">
                  <template v-if="lineTax(l, c) && lineTax(l, c).rate">{{ lineTax(l, c).rate }}%<br />{{ money(lineTax(l, c).amount) }}</template>
                  <template v-else>{{ l.exempt ? 'Exempt' : '—' }}</template>
                </td>
              </template>
              <template v-else>
                <td class="r">{{ l.exempt ? 'Exempt' : `${l.tax_rate}%` }}<span v-if="l.zero_rated" class="muted small"> (zero-rated)</span></td>
                <td class="r tabular">{{ money(l.tax_amount) }}</td>
              </template>
              <td class="r tabular">{{ money(l.total) }}</td>
            </tr>
          </tbody>
        </table>

        <section class="foot">
          <div class="foot__left">
            <table v-if="doc.tax_summary.length" class="summary">
              <thead><tr><th>{{ india ? 'GST rate' : L('vat_rate', 'VAT rate') }}</th><th class="r">Taxable</th><th class="r">Tax</th></tr></thead>
              <tbody><tr v-for="t in doc.tax_summary" :key="t.label"><td>{{ t.label }}</td><td class="r tabular">{{ money(t.taxable) }}</td><td class="r tabular">{{ money(t.tax) }}</td></tr></tbody>
            </table>
            <p v-if="doc.exempt_note" class="note">{{ doc.exempt_note }}</p>
            <p class="words"><strong>Amount in words:</strong> {{ doc.in_words }}</p>
            <img v-if="qr" :src="qr" alt="ZATCA e-invoice QR code" class="qr" />
          </div>
          <dl class="totals tabular">
            <dt>{{ L('subtotal', 'Total excl. tax') }}</dt><dd>{{ money(doc.net_total, cur) }}</dd>
            <dt>{{ india ? 'Total GST' : L('total_vat', 'Total VAT') }}</dt><dd>{{ money(doc.tax_total, cur) }}</dd>
            <template v-if="doc.rounding_adjustment"><dt>Rounding</dt><dd>{{ money(doc.rounding_adjustment, cur) }}</dd></template>
            <dt class="gt">{{ L('grand_total', 'Total incl. tax') }}</dt><dd class="gt">{{ money(doc.total, cur) }}</dd>
            <dt>{{ L('paid', 'Paid') }}</dt><dd>{{ money(doc.paid, cur) }}</dd>
            <dt>{{ L('balance', 'Balance due') }}</dt><dd>{{ money(doc.outstanding, cur) }}</dd>
          </dl>
        </section>
        <div class="sign">
          <div>For {{ doc.clinic.name }}<div class="line">{{ india ? 'Authorised signatory' : L('signature', 'Signature') }}</div></div>
        </div>
      </template>

      <!-- ============ PRESCRIPTION ============ -->
      <template v-else-if="kind === 'prescription'">
        <section class="blocks">
          <div class="block">
            <div class="lbl">{{ L('patient', 'Patient') }}</div>
            <strong>{{ doc.patient.patient_name }}</strong> <span class="muted">({{ doc.patient.name }})</span>
            <div>{{ doc.patient.age }} · {{ doc.patient.gender }}<span v-if="doc.patient.date_of_birth"> · DoB {{ niceDate(doc.patient.date_of_birth) }}</span></div>
            <div v-if="doc.patient.id_number">{{ doc.patient.id_type }}: {{ doc.patient.id_number }}</div>
            <div v-if="doc.patient.allergies" class="allergy">{{ L('allergies', 'Allergies') }}: {{ doc.patient.allergies }}</div>
          </div>
          <div class="block kv">
            <div><span class="lbl">{{ L('date', 'Date') }}</span><span>{{ niceDate(doc.date) }}</span></div>
            <div><span class="lbl">{{ L('practitioner', 'Prescriber') }}</span><span>{{ doc.practitioner?.practitioner_name }}</span></div>
            <div v-if="doc.practitioner?.qualification"><span class="lbl">Qualification</span><span>{{ doc.practitioner.qualification }}</span></div>
            <div><span class="lbl">Reg. / licence no.</span><span>{{ doc.practitioner?.registration_no || '—' }}</span></div>
          </div>
        </section>
        <p v-if="doc.chief_complaint"><strong>Complaint:</strong> {{ doc.chief_complaint }}</p>
        <p v-if="doc.vitals && (doc.vitals.bp_systolic || doc.vitals.pulse || doc.vitals.temperature || doc.vitals.weight)" class="small">
          <strong>Vitals:</strong>
          <span v-if="doc.vitals.bp_systolic"> BP {{ doc.vitals.bp_systolic }}/{{ doc.vitals.bp_diastolic }} mmHg</span>
          <span v-if="doc.vitals.pulse"> · Pulse {{ doc.vitals.pulse }}</span>
          <span v-if="doc.vitals.temperature"> · Temp {{ doc.vitals.temperature }} °C</span>
          <span v-if="doc.vitals.spo2"> · SpO₂ {{ doc.vitals.spo2 }}%</span>
          <span v-if="doc.vitals.weight"> · Wt {{ doc.vitals.weight }} kg</span>
        </p>
        <p v-if="doc.diagnoses.length"><strong>{{ L('diagnosis', 'Diagnosis') }}:</strong> {{ doc.diagnoses.map((d: Doc) => `${d.description || ''} ${d.code ? '(' + d.code + ')' : ''}`.trim()).join('; ') }}</p>
        <div class="rx">℞</div>
        <table class="lines">
          <thead><tr><th>#</th><th>{{ L('medicine', 'Medicine') }}</th><th>{{ L('dose', 'Dose') }}</th><th>{{ L('frequency', 'Frequency') }}</th><th>Route</th><th>{{ L('duration', 'Duration') }}</th><th class="r">{{ L('qty', 'Qty') }}</th></tr></thead>
          <tbody>
            <tr v-for="(m, i) in doc.items" :key="i">
              <td>{{ Number(i) + 1 }}</td>
              <td><strong :class="{ caps: india }">{{ m.medicine }}</strong> {{ m.strength }} <span class="muted">{{ m.dosage_form }}</span><div v-if="m.brand" class="small">Brand: {{ m.brand }}</div><div v-else class="small muted">Generic — any brand</div><div v-if="m.instructions" class="small muted">{{ m.instructions }}</div></td>
              <td>{{ m.dose }}</td><td>{{ m.frequency }}</td><td>{{ m.route }}</td><td>{{ m.duration }}</td><td class="r">{{ m.quantity }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="doc.advice"><strong>Advice:</strong> {{ doc.advice }}</p>
        <p v-if="doc.follow_up_date"><strong>Follow up:</strong> {{ niceDate(doc.follow_up_date) }}</p>
        <p v-else-if="doc.follow_up_days"><strong>Follow up:</strong> in {{ doc.follow_up_days }} days</p>
        <p class="small muted">Valid for {{ doc.valid_days }} days from the date of issue. {{ doc.standard_note }}</p>
        <div class="sign"><div>{{ doc.practitioner?.practitioner_name }}<div class="line">{{ L('signature', 'Signature & stamp') }}</div></div></div>
      </template>

      <!-- ============ CLAIM ============ -->
      <template v-else>
        <p class="small muted">{{ doc.standard_note }}</p>
        <section class="blocks">
          <div class="block">
            <div class="lbl">Payer</div>
            <strong>{{ doc.claim.payer }}</strong>
            <div v-if="doc.claim.payer_doc.payer_code">Payer code: {{ doc.claim.payer_doc.payer_code }}</div>
            <div v-if="doc.claim.payer_doc.claim_standard">{{ doc.claim.payer_doc.claim_standard }}</div>
          </div>
          <div class="block">
            <div class="lbl">Patient / member</div>
            <strong>{{ doc.patient.patient_name }}</strong> <span class="muted">({{ doc.patient.name }})</span>
            <div>{{ doc.patient.age }} · {{ doc.patient.gender }}<span v-if="doc.patient.date_of_birth"> · DoB {{ niceDate(doc.patient.date_of_birth) }}</span></div>
            <div v-if="doc.patient.id_number">{{ doc.patient.id_type }}: {{ doc.patient.id_number }}</div>
            <div>Policy {{ doc.claim.policy_doc?.policy_no }}<span v-if="doc.claim.policy_doc?.member_id"> · member {{ doc.claim.policy_doc.member_id }}</span></div>
          </div>
          <div class="block kv">
            <div><span class="lbl">Claim no.</span><span class="tabular">{{ doc.claim.name }}</span></div>
            <div><span class="lbl">Claim date</span><span>{{ niceDate(doc.claim.claim_date) }}</span></div>
            <div><span class="lbl">Date of service</span><span>{{ niceDate(doc.encounter_date) }}</span></div>
            <div><span class="lbl">Invoice</span><span class="tabular">{{ doc.claim.invoice }}</span></div>
            <div v-if="doc.claim.preauth_no"><span class="lbl">Pre-auth no.</span><span>{{ doc.claim.preauth_no }}</span></div>
            <div><span class="lbl">Treating doctor</span><span>{{ doc.practitioner?.practitioner_name }} ({{ doc.practitioner?.registration_no || '—' }})</span></div>
          </div>
        </section>
        <p v-if="doc.chief_complaint"><strong>Presenting complaint:</strong> {{ doc.chief_complaint }}</p>
        <table class="lines">
          <thead><tr><th>Type</th><th>ICD-10</th><th>Description</th></tr></thead>
          <tbody>
            <tr v-for="(d, i) in doc.claim.diagnoses" :key="i"><td>{{ d.primary ? 'Principal' : 'Secondary' }}</td><td class="tabular"><strong>{{ d.code }}</strong></td><td>{{ d.description }}</td></tr>
            <tr v-if="!doc.claim.diagnoses.length"><td colspan="3" class="muted">No diagnosis recorded — most payers reject claims without an ICD-10 code.</td></tr>
          </tbody>
        </table>
        <table class="lines">
          <thead><tr><th>#</th><th>Service</th><th>Code</th><th class="r">Qty</th><th class="r">Claimed</th><th class="r">Approved</th></tr></thead>
          <tbody>
            <tr v-for="(it, i) in doc.claim.items" :key="i"><td>{{ Number(i) + 1 }}</td><td>{{ it.service }}</td><td class="tabular">{{ it.code }}</td><td class="r">{{ it.qty }}</td><td class="r tabular">{{ money(it.amount) }}</td><td class="r tabular">{{ it.approved_amount ? money(it.approved_amount) : '' }}</td></tr>
          </tbody>
        </table>
        <dl class="totals tabular" style="margin-inline-start: auto; width: 320px">
          <dt class="gt">Total claimed</dt><dd class="gt">{{ money(doc.claim.claimed_amount, doc.clinic.currency) }}</dd>
          <dt>Approved</dt><dd>{{ doc.claim.approved_amount ? money(doc.claim.approved_amount, doc.clinic.currency) : '—' }}</dd>
        </dl>
        <p class="words"><strong>Amount in words:</strong> {{ doc.total_in_words }}</p>
        <p class="small">I certify that the services listed were medically necessary and were provided to the patient named above on the date shown.</p>
        <div class="sign two">
          <div>Treating doctor<div class="line">Signature &amp; stamp</div></div>
          <div>Patient / member<div class="line">Signature</div></div>
        </div>
      </template>

      <footer v-if="doc.clinic.footer" class="footer">{{ doc.clinic.footer }}</footer>
    </article>
  </div>
</template>

<style scoped>
.print-root { min-height: 100dvh; background: var(--x-bg-sunken); padding: 24px 16px; }
.toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; align-items: center; gap: 12px; }
.sheet { max-width: 210mm; margin: 0 auto; background: #fff; color: #0f172a; padding: 14mm 14mm 18mm; box-shadow: var(--x-shadow-md); border-radius: 6px; font-size: 12.5px; line-height: 1.45; }
.lh { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #2563eb; }
.lh__brand { display: flex; gap: 12px; align-items: flex-start; }
.lh__logo { width: 56px; height: 56px; object-fit: contain; }
.lh__name { font-family: var(--x-font-display); font-weight: 800; font-size: 19px; }
.lh__meta { color: #475569; font-size: 11.5px; }
.lh__title { text-align: end; }
.title { font-family: var(--x-font-display); font-weight: 800; font-size: 20px; text-transform: uppercase; letter-spacing: 0.04em; color: #1d4ed8; }
.title-ar { font-size: 18px; font-weight: 700; color: #1d4ed8; }
.blocks { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 14px 0; }
.block { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
.lbl { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }
.kv > div { display: flex; justify-content: space-between; gap: 10px; }
.kv .lbl { display: inline; }
.pre { white-space: pre-wrap; }
.lines { width: 100%; border-collapse: collapse; margin: 10px 0; }
.lines th { background: #f1f5f9; text-align: start; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #334155; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
.lines td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.r { text-align: end; }
.foot { display: grid; grid-template-columns: 1fr 300px; gap: 16px; margin-top: 8px; }
.summary { border-collapse: collapse; font-size: 11.5px; }
.summary th, .summary td { padding: 3px 10px 3px 0; text-align: start; }
.note { font-style: italic; color: #334155; }
.words { margin: 6px 0; }
.qr { width: 120px; height: 120px; margin-top: 6px; }
.totals { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; margin: 0; }
.totals dt { color: #475569; }
.totals dd { margin: 0; text-align: end; }
.totals .gt { font-weight: 800; font-size: 14px; color: #0f172a; border-top: 1px solid #0f172a; padding-top: 4px; }
.sign { display: flex; justify-content: flex-end; margin-top: 36px; }
.sign.two { justify-content: space-between; }
.sign .line { margin-top: 36px; border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 200px; color: #64748b; font-size: 11px; }
.rx { font-size: 30px; font-weight: 700; color: #1d4ed8; margin: 4px 0 -4px; }
.caps { text-transform: uppercase; }
.allergy { color: #b91c1c; font-weight: 700; }
.footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; white-space: pre-wrap; text-align: center; }
.muted { color: #64748b; }
@media print {
  .print-root { background: #fff; padding: 0; }
  .sheet { box-shadow: none; border-radius: 0; padding: 0; max-width: none; }
  @page { size: A4; margin: 12mm; }
}
</style>
