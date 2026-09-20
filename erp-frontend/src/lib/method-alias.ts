// Public-facing method names for the /api/method proxy.
//
// The browser (and anyone inspecting network traffic or a shared link) only
// ever sees `xentraerp.*` method names; the backend framework's own module
// paths are translated here, server-side, right before the request is
// forwarded. Mapping:
//
//   xentraerp.erp.<path>  ->  erpnext.<path>
//   xentraerp.<path>      ->  frappe.<path>
//
// The order matters — `xentraerp.erp.` must be tested first, since it also
// starts with `xentraerp.`. Names that don't start with either prefix
// (`login`, `logout`, `upload_file`, `custom_erp.*`, ...) pass through
// untouched. Legacy un-aliased names are still accepted so a page loaded
// before this change keeps working until it is refreshed.
const PUBLIC_PREFIX = 'xentraerp.';
const PUBLIC_ERP_PREFIX = 'xentraerp.erp.';

export function toBackendMethod(name: string): string {
  if (name.startsWith(PUBLIC_ERP_PREFIX)) return `erpnext.${name.slice(PUBLIC_ERP_PREFIX.length)}`;
  if (name.startsWith(PUBLIC_PREFIX)) return `frappe.${name.slice(PUBLIC_PREFIX.length)}`;
  return name;
}

// Only dotted module-style paths (frappe.exceptions.X, erpnext.a.b) — not any
// bare occurrence of the word, so ordinary text is left alone.
function aliasModulePaths(text: string): string {
  return text
    .replace(/\berpnext\.(?=[a-z_])/g, PUBLIC_ERP_PREFIX)
    .replace(/\bfrappe\.(?=[a-z_])/g, PUBLIC_PREFIX);
}

// Rewrites backend module paths that leak into an error payload, so a failed
// request doesn't reveal the framework. Applied to error (>= 400) JSON only:
//  - `exc` (a Python traceback, present when the backend runs in developer
//    mode) is dropped entirely — it carries filesystem paths and module names;
//  - `exc_type`, `exception` and `_server_messages` get module prefixes
//    aliased (frappe.exceptions.X -> xentraerp.exceptions.X).
// Anything unparseable is returned untouched rather than risk corrupting it.
export function scrubErrorBody(data: Buffer<ArrayBuffer>, contentType: string | undefined): Buffer<ArrayBuffer> {
  if (!contentType || !contentType.includes('json')) return data;
  try {
    const parsed = JSON.parse(data.toString('utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return data;
    delete parsed.exc;
    // exc_type / exception / _server_messages can all quote a module path
    // (e.g. "frappe.exceptions.ValidationError: Failed to get method for
    // command frappe.x.y") — alias every dotted module-style occurrence.
    for (const key of ['exc_type', 'exception', '_server_messages']) {
      if (typeof parsed[key] === 'string') parsed[key] = aliasModulePaths(parsed[key]);
    }
    return Buffer.from(JSON.stringify(parsed), 'utf-8');
  } catch {
    return data;
  }
}
