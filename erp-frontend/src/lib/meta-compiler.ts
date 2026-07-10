import type {
  DocField,
  DocTypeMeta,
  DocPerm,
  PermissionSet,
  ComponentType,
  RenderField,
  RenderSection,
  RenderTab,
  RenderSchema,
} from '@/types/meta';

// Map an ERPNext fieldtype to a XentraERP frontend component (§7 of blueprint).
function componentFor(field: DocField): ComponentType {
  switch (field.fieldtype) {
    case 'Data':
    case 'Small Text':
    case 'Password':
    case 'Read Only':
      return field.fieldtype === 'Read Only' ? 'read_only' : 'text';
    case 'Text':
    case 'Long Text':
    case 'Text Editor':
    case 'HTML Editor':
    case 'Code':
    case 'JSON':
      return 'textarea';
    case 'Int':
    case 'Float':
      return 'number';
    case 'Currency':
      return 'currency';
    case 'Percent':
      return 'percent';
    case 'Date':
      return 'date';
    case 'Datetime':
      return 'datetime';
    case 'Time':
      return 'time';
    case 'Select':
      return 'select';
    case 'Link':
    case 'Dynamic Link':
      return 'link';
    case 'Check':
      return 'check';
    case 'Table':
    case 'Table MultiSelect':
      return 'child_table';
    default:
      return 'unsupported';
  }
}

const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break']);
const SKIP_TYPES = new Set(['HTML', 'Heading', 'Button', 'Fold', 'Barcode', 'Image']);

function toRenderField(f: DocField): RenderField {
  return {
    fieldname: f.fieldname,
    label: f.label || f.fieldname,
    component: componentFor(f),
    fieldtype: f.fieldtype,
    options: f.options,
    reqd: f.reqd === 1,
    readOnly: f.read_only === 1,
    dependsOn: f.depends_on || undefined,
    mandatoryDependsOn: f.mandatory_depends_on || undefined,
    readOnlyDependsOn: f.read_only_depends_on || undefined,
    precision: f.precision ? Number(f.precision) : undefined,
    default: f.default || undefined,
    description: f.description || undefined,
  };
}

// Cheap stable fingerprint of the schema for cache invalidation.
export function hashMeta(meta: DocTypeMeta): string {
  const sig = (meta.fields || [])
    .map((f) => `${f.fieldname}:${f.fieldtype}:${f.reqd || 0}:${f.hidden || 0}`)
    .join('|');
  let h = 0;
  for (let i = 0; i < sig.length; i++) {
    h = (h << 5) - h + sig.charCodeAt(i);
    h |= 0;
  }
  return `${meta.name}-${h}`;
}

/**
 * Compile raw DocType metadata into a tab/section/column render tree.
 * Walks fields in order; Tab/Section/Column breaks open new containers.
 */
export function compileSchema(meta: DocTypeMeta): RenderSchema {
  const tabs: RenderTab[] = [];
  let currentTab: RenderTab = { label: 'Details', sections: [] };
  let currentSection: RenderSection = { collapsible: false, columns: [{ fields: [] }] };
  let currentColumn = currentSection.columns[0];

  const pushSection = () => {
    if (currentSection.columns.some((c) => c.fields.length > 0) || currentSection.label) {
      currentTab.sections.push(currentSection);
    }
  };
  const pushTab = () => {
    pushSection();
    if (currentTab.sections.length > 0) tabs.push(currentTab);
  };

  for (const f of meta.fields || []) {
    if (f.hidden === 1) continue;
    if (SKIP_TYPES.has(f.fieldtype)) continue;

    if (f.fieldtype === 'Tab Break') {
      pushTab();
      currentTab = { label: f.label || 'Tab', sections: [] };
      currentSection = { collapsible: false, columns: [{ fields: [] }] };
      currentColumn = currentSection.columns[0];
      continue;
    }
    if (f.fieldtype === 'Section Break') {
      pushSection();
      currentSection = {
        label: f.label || undefined,
        collapsible: f.collapsible === 1,
        columns: [{ fields: [] }],
      };
      currentColumn = currentSection.columns[0];
      continue;
    }
    if (f.fieldtype === 'Column Break') {
      currentColumn = { fields: [] };
      currentSection.columns.push(currentColumn);
      continue;
    }
    if (LAYOUT_TYPES.has(f.fieldtype)) continue;

    currentColumn.fields.push(toRenderField(f));
  }
  pushTab();

  // Guarantee at least one tab so the renderer always has something.
  if (tabs.length === 0) {
    tabs.push({ label: 'Details', sections: [currentSection] });
  }

  return {
    doctype: meta.name,
    isSubmittable: meta.is_submittable === 1,
    titleField: meta.title_field,
    tabs,
    permissions: meta.permissions || [],
    schema_hash: hashMeta(meta),
  };
}

// Resolve DocPerm rows against the user's roles into an effective matrix (§14).
// permlevel 0 only (field-level permlevels handled separately). Fail closed.
export function resolvePermissions(perms: DocPerm[], roles: string[]): PermissionSet {
  const roleSet = new Set(roles);
  const base: PermissionSet = {
    read: false,
    write: false,
    create: false,
    submit: false,
    cancel: false,
    amend: false,
    delete: false,
  };
  for (const p of perms || []) {
    if ((p.permlevel ?? 0) !== 0) continue;
    if (!roleSet.has(p.role)) continue;
    base.read = base.read || p.read === 1;
    base.write = base.write || p.write === 1;
    base.create = base.create || p.create === 1;
    base.submit = base.submit || p.submit === 1;
    base.cancel = base.cancel || p.cancel === 1;
    base.amend = base.amend || p.amend === 1;
    base.delete = base.delete || p.delete === 1;
  }
  return base;
}
