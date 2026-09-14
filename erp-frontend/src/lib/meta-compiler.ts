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
  | 'hidden'
  | 'tab_break'
  | 'section_break'
  | 'attach';

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
  depends_on?: string;
  mandatory_depends_on?: string;
}

// Frappe represents Check field values as 0/1, often as the *string* "0"/"1"
// (every field default from getdoctype meta is a string, and saved doc
// values can come back as strings too depending on the endpoint) — a plain
// `!!value` treats the string "0" as truthy, since any non-empty string is
// truthy in JS. That rendered every checkbox whose default is explicitly
// "0" (e.g. Disabled) as pre-checked. Compare against the real 0/1 values
// instead of relying on JS truthiness.
export function isChecked(value: unknown): boolean {
  return value === 1 || value === '1' || value === true;
}

export interface CompiledMeta {
  doctype: string;
  fields: CompiledField[];
  is_submittable: boolean;
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
  'Section Break': 'section_break',
  'Column Break': 'hidden',
  'Tab Break': 'tab_break',
  'Fold': 'hidden',
  'Heading': 'hidden',
  'Button': 'hidden',
  'Attach': 'attach',
  'Attach Image': 'attach',
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
    .filter((f: any) => f.fieldname && f.fieldtype !== 'Column Break' && f.fieldtype !== 'Heading' && f.fieldtype !== 'HTML' && f.fieldtype !== 'Fold' && f.fieldtype !== 'Button')
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
      depends_on: f.depends_on,
      mandatory_depends_on: f.mandatory_depends_on,
    }));

  return { doctype: rawMeta.name, fields, is_submittable: !!rawMeta.is_submittable };
}

// ---------------------------------------------------------------------------
// depends_on / mandatory_depends_on evaluation
//
// Frappe doctypes express these as either a bare fieldname (truthy check) or
// a JS-ish expression prefixed with "eval:", e.g.
//   eval:doc.status=="Lost"
//   eval:doc.status!="Lost"
//   eval:doc.some_field
//   eval:!doc.some_field
//   eval:doc.qty==1
//   eval:doc.a=="X" && doc.b=="Y"
//   eval:doc.a=="X" || doc.b=="Y"
//
// We deliberately do NOT use JS eval() on this string. Instead we parse the
// small set of patterns Frappe doctypes actually use in practice. Anything
// we don't recognize is treated as "condition met" (fail OPEN) so we never
// hide a field/section that should be visible — the safer failure mode for
// a data-entry form.
// ---------------------------------------------------------------------------

type DocLike = Record<string, unknown>;

function coerceCmpValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // strip matching quotes
  const m = trimmed.match(/^["'](.*)["']$/);
  return m ? m[1] : trimmed;
}

function readDocField(doc: DocLike, field: string): unknown {
  return doc[field];
}

function isTruthyDocValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '' && v !== '0';
  if (typeof v === 'number') return v !== 0;
  return !!v;
}

// Evaluate a single atomic condition like `doc.field=="X"`, `doc.field!="X"`,
// `doc.field==1`, `doc.field`, `!doc.field`. Returns null if it doesn't
// recognize the pattern (caller should fail open).
function evalAtom(atom: string, doc: DocLike): boolean | null {
  const s = atom.trim();

  // !doc.field
  let m = s.match(/^!\s*doc\.([a-zA-Z0-9_]+)$/);
  if (m) return !isTruthyDocValue(readDocField(doc, m[1]));

  // doc.field == "value"  or  doc.field != "value"  (also numeric/bool)
  m = s.match(/^doc\.([a-zA-Z0-9_]+)\s*(==|!=)\s*(.+)$/);
  if (m) {
    const [, field, op, rawVal] = m;
    const expected = coerceCmpValue(rawVal);
    const actualRaw = readDocField(doc, field);
    let actual: string | number | boolean;
    if (typeof expected === 'number') actual = Number(actualRaw ?? 0);
    else if (typeof expected === 'boolean') actual = isTruthyDocValue(actualRaw);
    else actual = String(actualRaw ?? '');
    const equal = actual === expected;
    return op === '==' ? equal : !equal;
  }

  // bare doc.field truthy check
  m = s.match(/^doc\.([a-zA-Z0-9_]+)$/);
  if (m) return isTruthyDocValue(readDocField(doc, m[1]));

  return null;
}

/**
 * Evaluate a Frappe depends_on / mandatory_depends_on expression against a
 * doc-like object. Returns true when the condition is met (field should be
 * shown / is mandatory), and fails OPEN (returns true) for anything it
 * cannot parse, rather than hiding real data-entry fields.
 */
export function evalDependsOn(expr: string | undefined | null, doc: DocLike): boolean {
  if (!expr) return true;
  const trimmed = expr.trim();
  if (!trimmed) return true;

  // Non-"eval:" values are treated as a bare fieldname truthy check
  // (Frappe supports this shorthand for depends_on).
  const body = trimmed.startsWith('eval:') ? trimmed.slice(5).trim() : `doc.${trimmed}`;
  if (!body) return true;

  // Split on top-level && / || (no parens support needed for our patterns —
  // doctypes in this app don't nest them).
  const orParts = body.split('||');
  try {
    return orParts.some((orPart) => {
      const andParts = orPart.split('&&');
      return andParts.every((atom) => {
        const r = evalAtom(atom, doc);
        return r === null ? true : r; // fail open per-atom too
      });
    });
  } catch {
    return true;
  }
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
