#!/usr/bin/env node
// Builds erp-frontend/src/lib/reports/catalog.json — the standard report list
// and each report's filters — from the report definitions shipped with the
// installed frappe/erpnext apps.
//
// Report filters live in each report's client script (`<report>.js`), which
// Desk evaluates in the browser. Here every script is evaluated once, offline,
// against a stub `frappe`/`erpnext` that records what the script defines.
// Defaults that depend on the session (today, the user's company, the fiscal
// year) are recorded as tokens (`@today`, `@company`, `@today|m-1`, ...) which
// the report page resolves at run time. Re-run after an ERPNext upgrade:
//
//   node scripts/generate-report-catalog.mjs /home/frappe/innovegic-bench/apps
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const appsDir = process.argv[2] || '/home/frappe/innovegic-bench/apps';
const outFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '../erp-frontend/src/lib/reports/catalog.json');

// ERPNext module -> section on the Reports page. Modules not listed here
// (Core, Desk, Loan Management, ...) are not offered.
const SECTIONS = {
  Accounts: 'Accounting',
  Selling: 'Selling',
  CRM: 'CRM',
  Buying: 'Buying',
  Stock: 'Stock',
  Manufacturing: 'Manufacturing',
  Projects: 'Projects',
  Assets: 'Assets',
  'Quality Management': 'Quality',
  Support: 'Support',
  Regional: 'Accounting', // country tax/VAT reports
  Website: 'Website',
};

// Standard reports that don't apply to this deployment: country-specific
// statutory reports, data-integrity diagnostics meant for developers, and
// Report Builder (saved list view) reports, which have no script to run.
const EXCLUDE = new Set([
  'TDS Computation Summary', 'TDS Payable Monthly',
  'FIFO Queue vs Qty After Transaction Comparison', 'Incorrect Balance Qty After Transaction',
  'Incorrect Serial No Valuation', 'Incorrect Stock Value Report', 'Stock Ledger Invariant Check',
  'Stock Qty vs Serial No Count', 'Stock and Account Value Comparison',
  'Database Storage Usage By Tables',
  'Review', // broken in ERPNext v14: selects a Quality Action column that doesn't exist
]);

// Reports moved into a section other than their ERPNext module.
const SECTION_OVERRIDE = { 'POS Register': 'Point of Sale', 'Sales Payment Summary': 'Point of Sale' };

const tokenCall = (name) => (...args) => `@${name}${args.length ? '(' + args.join(',') + ')' : ''}`;

function makeSandbox(appRoots) {
  const queryReports = {};
  const linkOptionDoctypes = [];
  const recorder = () => new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : recorder()),
    apply: () => recorder(),
  });
  const datetime = {
    get_today: () => '@today', nowdate: () => '@today', now_date: () => '@today',
    now_datetime: () => '@now', month_start: () => '@month_start', month_end: () => '@month_end',
    year_start: () => '@year_start', year_end: () => '@year_end',
    add_months: (d, n) => `${d}|m${n}`, add_days: (d, n) => `${d}|d${n}`,
    str_to_obj: (d) => d, obj_to_str: (d) => d, user_to_str: (d) => d, get_diff: () => 0,
    convert_to_system_tz: (d) => d,
  };
  const userDefault = (key) => {
    const k = String(key).toLowerCase();
    if (k === 'company') return '@company';
    if (k === 'fiscal_year') return '@fiscal_year';
    if (k === 'year_start_date') return '@year_start';
    if (k === 'year_end_date') return '@year_end';
    if (k === 'currency' || k === 'default_currency') return '@currency';
    return '';
  };
  const frappe = new Proxy({
    query_reports: queryReports,
    datetime,
    defaults: { get_user_default: userDefault, get_default: userDefault, get_global_default: userDefault, get_user_defaults: () => [] },
    db: new Proxy({ get_link_options: (doctype) => { linkOptionDoctypes.push(doctype); return []; } },
      { get: (t, k) => (k in t ? t[k] : recorder()) }),
    provide: (ns) => {
      let o = ctx;
      for (const p of ns.split('.')) o = o[p] = o[p] || {};
    },
    require: (assets, cb) => {
      for (const a of [].concat(assets)) {
        const m = a.match(/^\/?assets\/([^/]+)\/(.+)$/);
        if (m) {
          const file = appRoots.map((r) => path.join(r, m[1], m[1], 'public', m[2])).find((f) => fs.existsSync(f));
          if (file) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
        }
      }
      cb && cb();
    },
    boot: { sysdefaults: {} },
    sys_defaults: { fiscal_year: '@fiscal_year', year_start_date: '@year_start', year_end_date: '@year_end', company: '@company', currency: '@currency' },
    session: { user: '@user' },
  }, { get: (t, k) => (k in t ? t[k] : recorder()) });

  const erpnextObj = new Proxy({
    utils: new Proxy({ add_dimensions: () => {}, add_inventory_dimensions: () => {}, get_fiscal_year: () => '@fiscal_year' },
      { get: (t, k) => (k in t ? t[k] : recorder()) }),
    get_presentation_currency_list: () => [],
    dimension_filters: [],
  }, {
    get: (t, k) => (k in t ? t[k] : recorder()),
    set: (t, k, v) => { t[k] = v; return true; },
  });

  const $ = new Proxy(function () { return recorder(); }, {
    get: (t, k) => {
      if (k === 'extend') return (...objs) => {
        const deep = objs[0] === true;
        if (deep) objs.shift();
        const out = objs[0] || {};
        for (const o of objs.slice(1)) for (const [kk, vv] of Object.entries(o || {})) out[kk] = Array.isArray(vv) ? vv.slice() : vv;
        return out;
      };
      if (k === 'grep') return (arr, fn) => (arr || []).filter(fn);
      if (k === 'each') return (arr, fn) => (arr || []).forEach((v, i) => fn(i, v));
      return recorder();
    },
  });

  const ctx = vm.createContext({
    frappe, erpnext: erpnextObj, $, jQuery: $, __: (s) => s, moment: recorder(), console,
    window: {}, document: recorder(), cur_frm: undefined, format_currency: (v) => v,
    locals: { ':Company': { '@company': { default_bank_account: '@company_bank_account' } } }, user: '@user', get_today: () => '@today',
  });
  ctx.window = ctx;
  return { ctx, queryReports, linkOptionDoctypes };
}

const scrub = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function toFilter(f, sb) {
  if (!f || typeof f !== 'object' || !f.fieldname) return null;
  const out = { fieldname: f.fieldname, label: String(f.label || f.fieldname), fieldtype: f.fieldtype || 'Data' };
  let options = f.options;
  if (out.fieldtype === 'MultiSelectList' && typeof f.get_data === 'function') {
    sb.linkOptionDoctypes.length = 0;
    try { f.get_data(''); } catch { /* recorded what it could */ }
    if (sb.linkOptionDoctypes.length) options = sb.linkOptionDoctypes[0];
  }
  if (Array.isArray(options)) {
    options = options.map((o) => (o && typeof o === 'object' ? { value: String(o.value ?? ''), label: String(o.label ?? o.value ?? '') } : String(o)));
  } else if (typeof options === 'string') {
    if (out.fieldtype === 'Select') options = options.split('\n');
  } else options = undefined;
  if (options !== undefined) out.options = options;
  let def = f.default;
  if (Array.isArray(def)) def = def[0];
  if (typeof def === 'function') def = undefined;
  if (def !== undefined && def !== null && def !== '' && typeof def !== 'object') out.default = def;
  if (f.reqd) out.reqd = 1;
  if (f.hidden) out.hidden = 1;
  if (typeof f.depends_on === 'string') out.depends_on = f.depends_on;
  if (f.width && typeof f.width === 'string') out.width = f.width;
  return out;
}

// Financial statements switch between a fiscal-year range and a date range on
// `filter_based_on`; Desk does it in onload via toggle_filter_display, which
// leaves the hidden pair marked required. Express it as depends_on instead.
function linkFilterBasedOn(filters) {
  if (!filters.some((f) => f.fieldname === 'filter_based_on')) return;
  const when = { period_start_date: 'Date Range', period_end_date: 'Date Range', from_fiscal_year: 'Fiscal Year', to_fiscal_year: 'Fiscal Year' };
  for (const f of filters) {
    if (!when[f.fieldname] || f.depends_on) continue;
    f.depends_on = `eval:doc.filter_based_on == '${when[f.fieldname]}'`;
    if (f.fieldname === 'period_start_date' && f.default === undefined) f.default = '@year_start';
    if (f.fieldname === 'period_end_date' && f.default === undefined) f.default = '@year_end';
  }
}

function main() {
  const appRoots = [appsDir];
  const reports = [];
  for (const app of ['erpnext', 'frappe']) {
    const pkg = path.join(appsDir, app, app);
    for (const mod of fs.readdirSync(pkg)) {
      const reportDir = path.join(pkg, mod, 'report');
      if (!fs.existsSync(reportDir)) continue;
      for (const r of fs.readdirSync(reportDir)) {
        const json = path.join(reportDir, r, `${r}.json`);
        if (!fs.existsSync(json)) continue;
        const meta = JSON.parse(fs.readFileSync(json, 'utf8'));
        const section = SECTION_OVERRIDE[meta.name] || SECTIONS[meta.module];
        if (!section || meta.disabled || EXCLUDE.has(meta.name)) continue;
        if (!['Script Report', 'Query Report'].includes(meta.report_type)) continue;
        const sb = makeSandbox(appRoots);
        const js = path.join(reportDir, r, `${r}.js`);
        let filters = [];
        if (fs.existsSync(js)) {
          try {
            vm.runInContext(fs.readFileSync(js, 'utf8'), sb.ctx, { filename: js });
          } catch (e) {
            console.warn(`! ${meta.name}: ${e.message}`);
          }
          const def = sb.queryReports[meta.name] || Object.values(sb.queryReports)[0];
          if (def && Array.isArray(def.filters)) filters = def.filters.map((f) => toFilter(f, sb)).filter(Boolean);
          linkFilterBasedOn(filters);
        }
        reports.push({
          name: meta.name, slug: scrub(meta.name), section, module: meta.module,
          ref_doctype: meta.ref_doctype, report_type: meta.report_type,
          add_total_row: meta.add_total_row ? 1 : 0, filters,
        });
      }
    }
  }
  reports.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(reports, null, 1) + '\n');
  console.log(`${reports.length} reports -> ${path.relative(process.cwd(), outFile)}`);
}

main();
