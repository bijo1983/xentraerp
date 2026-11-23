// FDI two-digit tooth numbering. Permanent: quadrants 1-4, teeth 1-8. Primary: 5-8, teeth 1-5.
// Rows are laid out as the dentist faces the patient: upper right → upper left, lower right → lower left.
export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
export const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
export const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

export const CONDITION_TONE: Record<string, string> = {
  Sound: 'sound',
  Caries: 'danger',
  Filled: 'info',
  Crown: 'primary',
  Missing: 'muted',
  'Root canal': 'warning',
  Implant: 'primary',
  Bridge: 'primary',
  Fractured: 'danger',
  'Extraction planned': 'danger',
  Impacted: 'warning',
}
