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

export interface DocPerm {
  role: string;
  permlevel?: number;
  read?: 0 | 1;
  write?: 0 | 1;
  create?: 0 | 1;
  submit?: 0 | 1;
  cancel?: 0 | 1;
  amend?: 0 | 1;
  delete?: 0 | 1;
  report?: 0 | 1;
  export?: 0 | 1;
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
  permissions?: DocPerm[];
  // schema fingerprint computed client-side for cache invalidation
  schema_hash?: string;
}

// ── Workflow (§15) ──────────────────────────────────────────────
export interface WorkflowState {
  state: string;
  doc_status?: string;
  allow_edit?: string;
}
export interface WorkflowTransition {
  state: string; // from state
  action: string;
  next_state: string;
  allowed: string; // role
  condition?: string;
}
export interface WorkflowDef {
  name: string;
  document_type: string;
  workflow_state_field: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

// Effective, role-resolved permission matrix for the current user (§14).
export interface PermissionSet {
  read: boolean;
  write: boolean;
  create: boolean;
  submit: boolean;
  cancel: boolean;
  amend: boolean;
  delete: boolean;
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
  permissions: DocPerm[];
  schema_hash?: string;
}
