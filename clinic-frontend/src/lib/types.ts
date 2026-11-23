export type Cap = 'patients' | 'appointments' | 'chart' | 'billing' | 'claims' | 'reports' | 'setup' | 'staff'

export interface TemplateField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'check' | 'date' | 'scale' | 'tooth_chart' | 'rows'
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: string[]
  conditions?: string[]
  columns?: TemplateField[]
}
export interface ChartTemplate {
  label: string
  sections: { label: string; fields: TemplateField[] }[]
}
export interface Practitioner {
  name: string
  practitioner_name: string
  specialty?: string
  registration_no?: string
  qualification?: string
  slot_minutes?: number
  color?: string
  user?: string
}
export interface Service {
  name: string
  category: 'Service' | 'Medicine' | 'Consumable'
  rate: number
  tax_class: TaxClass
  code?: string
  item?: string
}
export type TaxClass = 'healthcare' | 'cosmetic' | 'medicine' | 'goods'
export interface Payer {
  name: string
  payer_code?: string
  payer_type?: string
  default_coverage?: number
  claim_standard?: string
}
export interface ClinicSettings {
  clinic_name?: string
  clinic_type?: string
  region?: 'GCC' | 'India' | 'Europe' | 'Other'
  country?: string
  company?: string
  currency?: string
  licence_no?: string
  phone?: string
  email?: string
  address?: string
  tax_regime?: 'VAT' | 'GST' | 'None'
  tax_id?: string
  tax_id_label?: string
  standard_rate?: number
  state_code?: string
  arabic_invoice?: number
  slot_minutes?: number
  opening_time?: string | null
  closing_time?: string | null
  footer_note?: string
  configured?: number
  tax_classes: Record<TaxClass, number | 'exempt'>
  enabled_templates: string[]
}
export interface ClinicTypeInfo {
  code: string
  label: string
  templates: string[]
  appointment_types: { name: string; minutes: number }[]
}
export interface ClinicContext {
  user: string
  full_name: string
  caps: Cap[]
  practitioner: string | null
  configured: number
  settings: ClinicSettings
  templates: Record<string, ChartTemplate>
  appointment_types: { name: string; minutes: number }[]
  practitioners: Practitioner[]
  services: Service[]
  payers: Payer[]
  modes_of_payment: string[]
  standards: { claim_form: string; code_sets: string[]; prescription: string; id_types: string[] }
  catalog: { clinic_types: ClinicTypeInfo[]; templates: Record<string, { label: string }> }
}
export interface PatientRow {
  name: string
  patient_name: string
  gender?: string
  date_of_birth?: string
  mobile?: string
  id_number?: string
  allergies?: string
  age?: string
}
export interface Policy {
  name?: string
  patient?: string
  payer: string
  policy_no: string
  member_id?: string
  plan_name?: string
  coverage_pct?: number
  copay_cap?: number
  valid_from?: string
  valid_to?: string
  preauth_required?: number
  active?: number
}
export interface Patient extends PatientRow {
  email?: string
  id_type?: string
  nationality?: string
  blood_group?: string
  chronic_conditions?: string
  tax_id?: string
  state_code?: string
  address?: string
  customer?: string
  policies: Policy[]
  encounters: { name: string; encounter_date: string; practitioner: string; status: string; diagnoses: Diagnosis[]; patient_invoice?: string; payer_invoice?: string }[]
  appointments: { name: string; appointment_date: string; appointment_time: string; practitioner: string; appointment_type?: string; status: string }[]
  invoices: InvoiceRow[]
}
export interface Appointment {
  name: string
  patient: string
  patient_name: string
  practitioner: string
  appointment_type?: string
  appointment_date: string
  appointment_time: string
  duration: number
  status: AppointmentStatus
  notes?: string
  encounter?: string
  source?: string
}
export type AppointmentStatus = 'Booked' | 'Confirmed' | 'Checked In' | 'In Consultation' | 'Completed' | 'Cancelled' | 'No Show'
export interface Diagnosis {
  code: string
  description: string
  primary?: number
}
export interface RxItem {
  medicine: string
  strength?: string
  dosage_form?: string
  dose?: string
  frequency?: string
  route?: string
  duration?: string
  quantity?: string
  instructions?: string
}
export interface ServiceLine {
  item?: string
  item_name: string
  service?: string
  qty: number
  rate: number
  amount?: number
  tax_class?: TaxClass
  code?: string
}
export interface BillPreview {
  net: number
  tax: number
  total: number
  payer_net: number
  patient_net: number
  coverage_pct: number
}
export interface Encounter {
  name: string
  patient: string
  patient_name: string
  practitioner: string
  appointment?: string
  encounter_date: string
  status: 'Draft' | 'Completed' | 'Billed' | 'Cancelled'
  policy?: string | null
  templates: string[]
  chart_data: Record<string, Record<string, unknown>>
  diagnoses: Diagnosis[]
  notes?: string
  prescriptions: RxItem[]
  services: ServiceLine[]
  patient_invoice?: string
  payer_invoice?: string
  claim?: string
  patient_doc: PatientRow & { chronic_conditions?: string; blood_group?: string }
  practitioner_doc: Practitioner
  policy_doc: Policy | null
  bill_preview: BillPreview | null
}
export interface InvoiceRow {
  name: string
  posting_date: string
  customer?: string
  customer_name?: string
  grand_total: number
  rounded_total?: number
  outstanding_amount: number
  status: string
  currency: string
  remarks?: string
}
export type ClaimStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Partially Approved' | 'Rejected' | 'Paid'
export interface ClaimRow {
  name: string
  payer: string
  patient: string
  patient_name: string
  claim_date: string
  status: ClaimStatus
  claimed_amount: number
  approved_amount?: number
  paid_amount?: number
  invoice?: string
  payer_reference?: string
  encounter?: string
}
export interface Claim extends ClaimRow {
  policy?: string
  preauth_no?: string
  rejection_reason?: string
  submitted_on?: string
  payment_entry?: string
  diagnoses: Diagnosis[]
  items: { service: string; code?: string; qty: number; amount: number; approved_amount?: number }[]
  policy_doc: Policy | null
  payer_doc: Payer & { submission_email?: string; portal_url?: string }
}
