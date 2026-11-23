// Bilingual labels for printed documents. GCC documents print Arabic beside English when the
// clinic has "Bilingual (Arabic) documents" on (UAE FTA and KSA ZATCA both accept/expect it).
export const AR: Record<string, string> = {
  invoice_no: 'رقم الفاتورة',
  date: 'التاريخ',
  due: 'تاريخ الاستحقاق',
  bill_to: 'العميل',
  patient: 'المريض',
  tax_id: 'الرقم الضريبي',
  description: 'الوصف',
  qty: 'الكمية',
  unit_price: 'سعر الوحدة',
  net: 'المبلغ الخاضع للضريبة',
  vat_rate: 'نسبة الضريبة',
  vat: 'ضريبة القيمة المضافة',
  total: 'الإجمالي',
  subtotal: 'المجموع قبل الضريبة',
  total_vat: 'إجمالي ضريبة القيمة المضافة',
  grand_total: 'الإجمالي شامل الضريبة',
  paid: 'المدفوع',
  balance: 'المتبقي',
  policy: 'رقم البوليصة',
  practitioner: 'الطبيب',
  prescription: 'وصفة طبية',
  diagnosis: 'التشخيص',
  medicine: 'الدواء',
  dose: 'الجرعة',
  frequency: 'التكرار',
  duration: 'المدة',
  signature: 'التوقيع',
  claim: 'مطالبة تأمين',
  licence: 'رقم الترخيص',
  allergies: 'الحساسية',
}

export function bi(key: string, en: string, arabic: boolean): string {
  return arabic && AR[key] ? `${en} / ${AR[key]}` : en
}
