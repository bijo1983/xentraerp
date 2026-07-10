// ── ERPNext DocType metadata contracts ──────────────────────────
// These mirror the fields returned by frappe.desk.form.load.getdoctype
// so the frontend can render any DocType form dynamically (Phase 1/2).

export interface DocField {
  fieldname: string;
  label?: string;
  fieldtype: string;
  options?: string; // Link target / Select options / child DocType
  reqd?: 0 | 1;
  read_only?: 0 | 1;
  hidden?: 0 | 1;
  default?: string;
  depends_on?: string;
  mandatory_depends_on?: string;
  read_only_depends_on?: string;
  in_list_view?: 0 | 1;
  precision?: string;
  permlevel?: number;
  fetch_from?: string;
  description?: string;
  collapsible?: 0 | 1;
}

export interface DocTypeMeta {
  name: string;
  module?: string;
  issingle?: 0 | 1;
  istable?: 0 | 1;
  is_submittable?: 0 | 1;
  autoname?: string;
  title_field?: string;
  fields: DocField[];
  // schema fingerprint computed client-side for cache invalidation
  schema_hash?: string;
}

// ── Compiled render schema (Phase 2) ────────────────────────────

export type ComponentType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'link'
  | 'check'
  | 'child_table'
  | 'read_only'
  | 'unsupported';

export interface RenderField {
  fieldname: string;
  label: string;
  component: ComponentType;
  fieldtype: string;
  options?: string;
  reqd: boolean;
  readOnly: boolean;
  dependsOn?: string;
  mandatoryDependsOn?: string;
  readOnlyDependsOn?: string;
  precision?: number;
  default?: string;
  description?: string;
}

export interface RenderColumn {
  fields: RenderField[];
}

export interface RenderSection {
  label?: string;
  collapsible: boolean;
  columns: RenderColumn[];
}

export interface RenderTab {
  label: string;
  sections: RenderSection[];
}

export interface RenderSchema {
  doctype: string;
  isSubmittable: boolean;
  titleField?: string;
  tabs: RenderTab[];
  schema_hash?: string;
}
