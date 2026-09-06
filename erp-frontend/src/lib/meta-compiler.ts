// Maps Frappe fieldtypes to component types used by dynamic-form
export type ComponentType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'check'
  | 'select'
  | 'link'
  | 'table'
  | 'textarea'
  | 'readonly'
  | 'hidden';

export interface CompiledField {
  fieldname: string;
  label: string;
  fieldtype: string;       // raw Frappe fieldtype
  component: ComponentType;
  options?: string;        // for Link: target doctype; for Dynamic Link: fieldname of the type selector; for Select: newline-separated choices; for Table: child doctype
  reqd?: boolean;
  read_only?: boolean;
  hidden?: boolean;
  default?: string;
  description?: string;
}

export interface CompiledMeta {
  doctype: string;
  fields: CompiledField[];
}

const FIELDTYPE_MAP: Record<string, ComponentType> = {
  'Data': 'text',
  'Small Text': 'textarea',
  'Text': 'textarea',
  'Long Text': 'textarea',
  'Text Editor': 'textarea',
  'Int': 'number',
  'Float': 'number',
  'Currency': 'number',
  'Percent': 'number',
  'Date': 'date',
  'Datetime': 'datetime',
  'Time': 'text',
  'Check': 'check',
  'Select': 'select',
  'Link': 'link',
  'Dynamic Link': 'link',   // rendered same as link, but options = fieldname of type selector
  'Table': 'table',
  'Table MultiSelect': 'table',
  'Read Only': 'readonly',
  'HTML': 'hidden',
  'Section Break': 'hidden',
  'Column Break': 'hidden',
  'Tab Break': 'hidden',
  'Fold': 'hidden',
  'Heading': 'hidden',
  'Button': 'hidden',
  'Attach': 'text',
  'Attach Image': 'text',
  'Barcode': 'text',
  'Color': 'text',
  'Rating': 'number',
  'Signature': 'hidden',
  'Geolocation': 'hidden',
  'Duration': 'text',
  'Password': 'text',
  'Phone': 'text',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compileMeta(rawMeta: any): CompiledMeta {
  const fields: CompiledField[] = (rawMeta.fields || [])
    .filter((f: any) => f.fieldname && f.fieldtype !== 'Section Break' && f.fieldtype !== 'Column Break' && f.fieldtype !== 'Tab Break' && f.fieldtype !== 'Heading' && f.fieldtype !== 'HTML' && f.fieldtype !== 'Fold' && f.fieldtype !== 'Button')
    .map((f: any): CompiledField => ({
      fieldname: f.fieldname,
      label: f.label || f.fieldname,
      fieldtype: f.fieldtype,
      component: FIELDTYPE_MAP[f.fieldtype] || 'text',
      options: f.options,
      reqd: !!f.reqd,
      read_only: !!f.read_only,
      hidden: !!f.hidden,
      default: f.default,
      description: f.description,
    }));

  return { doctype: rawMeta.name, fields };
}

export interface PermissionSet {
  read: boolean;
  write: boolean;
  create: boolean;
  submit: boolean;
  cancel: boolean;
  amend: boolean;
  delete: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolvePermissions(permissions: any[], _roles?: string[]): PermissionSet {
  const p: PermissionSet = { read: false, write: false, create: false, submit: false, cancel: false, amend: false, delete: false };
  for (const perm of (permissions || [])) {
    if (perm.read) p.read = true;
    if (perm.write) p.write = true;
    if (perm.create) p.create = true;
    if (perm.submit) p.submit = true;
    if (perm.cancel) p.cancel = true;
    if (perm.amend) p.amend = true;
    if (perm.delete) p.delete = true;
  }
  return p;
}
