import axios, { AxiosInstance } from 'axios';

// Server-managed fields that must not be carried into a new/amended doc.
const SERVER_FIELDS = new Set([
  'name',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'idx',
  'docstatus',
  'parent',
  'parentfield',
  'parenttype',
  '__islocal',
  '__unsaved',
  'amended_from',
]);

// Deep-clean a fetched document (and its child rows) of server-managed
// fields so it can be re-inserted as a fresh document.
function stripServerFields(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (SERVER_FIELDS.has(k)) continue;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
      out[k] = v.map((row) => stripServerFields(row as Record<string, unknown>));
    } else {
      out[k] = v;
    }
  }
  return out;
}

class FrappeClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: '',
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  setToken(token: string) {
    this.http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearToken() {
    delete this.http.defaults.headers.common['Authorization'];
  }

  // ── Authentication ──────────────────────────────────────────────
  async login(usr: string, pwd: string) {
    const res = await this.http.post('/api/erp/method/login', { usr, pwd });
    return res.data;
  }

  async logout() {
    const res = await this.http.post('/api/erp/method/logout');
    this.clearToken();
    return res.data;
  }

  // ── Create a user with a password + roles (admin action) ────────
  async createUser(email: string, fullName: string, password: string, roles: string[]) {
    const [first, ...rest] = fullName.trim().split(' ');
    return this.createDoc('User', {
      email,
      first_name: first || email,
      last_name: rest.join(' ') || undefined,
      new_password: password,
      send_welcome_email: 0,
      roles: roles.map((role) => ({ role })),
    });
  }

  // ── Restrict a user to a Company (record-level isolation) ───────
  async addUserPermission(user: string, allow: string, value: string) {
    return this.createDoc('User Permission', { user, allow, for_value: value });
  }

  // ── Self sign-up (ERPNext standard, if enabled on the site) ─────
  async signUp(email: string, fullName: string) {
    const res = await this.http.post('/api/erp/method/frappe.core.doctype.user.user.sign_up', {
      email,
      full_name: fullName,
      redirect_to: '/',
    });
    return res.data.message;
  }

  async getLoggedUser() {
    const res = await this.http.get('/api/erp/method/frappe.auth.get_logged_user');
    return res.data.message;
  }

  // ── Generic CRUD (Frappe REST) ──────────────────────────────────
  async getList(doctype: string, params?: Record<string, unknown>) {
    const res = await this.http.get(`/api/erp/resource/${doctype}`, { params });
    return res.data.data;
  }

  async getDoc(doctype: string, name: string) {
    const res = await this.http.get(`/api/erp/resource/${doctype}/${encodeURIComponent(name)}`);
    return res.data.data;
  }

  async createDoc(doctype: string, data: Record<string, unknown>) {
    const res = await this.http.post(`/api/erp/resource/${doctype}`, data);
    return res.data.data;
  }

  async updateDoc(doctype: string, name: string, data: Record<string, unknown>) {
    const res = await this.http.put(`/api/erp/resource/${doctype}/${encodeURIComponent(name)}`, data);
    return res.data.data;
  }

  async deleteDoc(doctype: string, name: string) {
    const res = await this.http.delete(`/api/erp/resource/${doctype}/${encodeURIComponent(name)}`);
    return res.data;
  }

  // ── Custom API Methods ──────────────────────────────────────────
  async call(method: string, args?: Record<string, unknown>) {
    const res = await this.http.post(`/api/erp/method/${method}`, args);
    return res.data.message;
  }

  // ── Report / Query ─────────────────────────────────────────────
  async getReport(reportName: string, filters?: Record<string, unknown>) {
    return this.call('frappe.client.get_report', {
      report_name: reportName,
      filters,
    });
  }

  async getCount(doctype: string, filters?: Record<string, unknown>) {
    return this.call('frappe.client.get_count', { doctype, filters });
  }

  // ── Live currency exchange rate (ERPNext fetches from the internet) ─
  async getExchangeRate(fromCurrency: string, toCurrency: string) {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return 1;
    try {
      const res = await this.http.get('/api/erp/method/erpnext.setup.utils.get_exchange_rate', {
        params: { from_currency: fromCurrency, to_currency: toCurrency },
      });
      const rate = Number(res.data?.message);
      return rate && rate > 0 ? rate : 1;
    } catch {
      return 1;
    }
  }

  // ── Run a Query Report (Trial Balance, P&L, GL, etc.) ───────────
  async runReport(reportName: string, filters: Record<string, unknown>) {
    const res = await this.http.get('/api/erp/method/frappe.desk.query_report.run', {
      params: { report_name: reportName, filters: JSON.stringify(filters) },
    });
    return (res.data?.message || res.data) as {
      result?: unknown[];
      columns?: { label: string; fieldname: string; fieldtype?: string; width?: number }[];
    };
  }

  // ── Single field value from a document ──────────────────────────
  async getValue(doctype: string, name: string, fieldname: string) {
    const res = await this.http.get(`/api/erp/resource/${doctype}/${encodeURIComponent(name)}`, {
      params: { fields: JSON.stringify([fieldname]) },
    });
    return res.data?.data?.[fieldname];
  }

  // ── Submit a draft document (docstatus 0 -> 1) ──────────────────
  // frappe.client.submit rebuilds the doc from the JSON it's given, so it
  // must receive the FULL saved document, not just {doctype, name}.
  async submitDoc(doctype: string, name: string) {
    const doc = await this.getDoc(doctype, name);
    return this.call('frappe.client.submit', { doc: JSON.stringify(doc) });
  }

  // ── Cancel a submitted document (docstatus 1 -> 2) ──────────────
  async cancelDoc(doctype: string, name: string) {
    return this.call('frappe.client.cancel', { doctype, name });
  }

  // ── Amend a cancelled document (new draft from amended_from) ────
  async amendDoc(doctype: string, name: string) {
    const source = (await this.getDoc(doctype, name)) as Record<string, unknown>;
    const cleaned = stripServerFields(source);
    return this.createDoc(doctype, {
      ...cleaned,
      amended_from: name,
      docstatus: 0,
    });
  }

  // ── DocType metadata (merges standard + custom fields) ──────────
  // Uses frappe.desk.form.load.getdoctype which returns the meta
  // (including Custom Fields / Property Setters) under `docs`.
  async getDocTypeMeta(doctype: string) {
    const res = await this.http.get('/api/erp/method/frappe.desk.form.load.getdoctype', {
      params: { doctype, with_parent: 1 },
    });
    const docs = res.data?.docs || res.data?.message?.docs || [];
    // The DocType meta doc is the one whose name matches the requested doctype.
    const meta = docs.find(
      (d: { doctype?: string; name?: string }) => d.doctype === 'DocType' && d.name === doctype
    );
    return meta || docs[0];
  }

  // ── Active workflow for a DocType (if any) ──────────────────────
  async getWorkflow(doctype: string) {
    const list = await this.getList('Workflow', {
      fields: JSON.stringify(['name']),
      filters: JSON.stringify([
        ['document_type', '=', doctype],
        ['is_active', '=', 1],
      ]),
      limit_page_length: 1,
    });
    const wfName = Array.isArray(list) && list[0]?.name;
    if (!wfName) return null;
    return this.getDoc('Workflow', wfName);
  }

  // ── Apply a workflow transition (returns updated doc) ───────────
  async applyWorkflow(doc: Record<string, unknown>, action: string) {
    return this.call('frappe.model.workflow.apply_workflow', {
      doc: JSON.stringify(doc),
      action,
    });
  }

  // ── Activity pane data (§9) ─────────────────────────────────────
  async getComments(doctype: string, name: string) {
    return this.getList('Comment', {
      fields: JSON.stringify(['name', 'content', 'owner', 'creation', 'comment_type']),
      filters: JSON.stringify([
        ['reference_doctype', '=', doctype],
        ['reference_name', '=', name],
        ['comment_type', '=', 'Comment'],
      ]),
      order_by: 'creation desc',
      limit_page_length: 50,
    });
  }

  async addComment(doctype: string, name: string, content: string) {
    return this.createDoc('Comment', {
      comment_type: 'Comment',
      reference_doctype: doctype,
      reference_name: name,
      content,
    });
  }

  async getVersions(doctype: string, name: string) {
    return this.getList('Version', {
      fields: JSON.stringify(['name', 'owner', 'creation']),
      filters: JSON.stringify([
        ['ref_doctype', '=', doctype],
        ['docname', '=', name],
      ]),
      order_by: 'creation desc',
      limit_page_length: 50,
    });
  }

  async getAttachments(doctype: string, name: string) {
    return this.getList('File', {
      fields: JSON.stringify(['name', 'file_name', 'file_url', 'creation']),
      filters: JSON.stringify([
        ['attached_to_doctype', '=', doctype],
        ['attached_to_name', '=', name],
      ]),
      order_by: 'creation desc',
      limit_page_length: 50,
    });
  }

  async getLinkedDocs(doctype: string, name: string) {
    // Two-step ERPNext linked-documents lookup. Both endpoints can be
    // unavailable/unwhitelisted or return 403 depending on the site and
    // the doctype (Singles like Stock Settings have no connections), so
    // fail soft and return {} instead of surfacing a console error.
    try {
      const linkRes = await this.http.get(
        '/api/erp/method/frappe.desk.form.linked_with.get_linked_doctypes',
        { params: { doctype } }
      );
      const linkinfo = linkRes.data?.message || {};
      // No linked doctypes → nothing to fetch; skip the (often unwhitelisted) POST.
      if (!linkinfo || Object.keys(linkinfo).length === 0) return {};
      const res = await this.http.post('/api/erp/method/frappe.desk.form.linked_with.get_linked_docs', {
        doctype,
        docname: name,
        linkinfo: JSON.stringify(linkinfo),
      });
      return (res.data?.message || {}) as Record<string, { name: string; status?: string }[]>;
    } catch {
      return {} as Record<string, { name: string; status?: string }[]>;
    }
  }

  // ── Link-field search (async dropdowns) ─────────────────────────
  async searchLink(doctype: string, txt: string, filters?: unknown) {
    const res = await this.http.get('/api/erp/method/frappe.desk.search.search_link', {
      params: {
        doctype,
        txt,
        ...(filters ? { filters: JSON.stringify(filters) } : {}),
      },
    });
    return (res.data?.message || res.data?.results || []) as {
      value: string;
      description?: string;
    }[];
  }
}

export const frappe = new FrappeClient();

/**
 * Turn a Frappe/axios error into a human message. ERPNext puts the
 * user-facing text in `_server_messages` (a JSON array of stringified
 * {message}) or `_error_message`; the raw `exception` string is the last
 * resort. Also strips ERPNext's <details>/<strong> HTML wrappers.
 */
export function frappeErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  const strip = (s: string) =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (data) {
    // _server_messages: '["{\\"message\\": \\"...\\"}", ...]'
    const sm = data._server_messages;
    if (typeof sm === 'string') {
      try {
        const arr = JSON.parse(sm) as string[];
        const msgs = arr
          .map((raw) => {
            try {
              const obj = JSON.parse(raw) as { message?: string };
              return obj.message ? strip(obj.message) : '';
            } catch {
              return strip(raw);
            }
          })
          .filter(Boolean);
        if (msgs.length) return msgs.join(' ');
      } catch {
        /* fall through */
      }
    }
    if (typeof data._error_message === 'string' && data._error_message.trim())
      return strip(data._error_message);
    if (typeof data.exception === 'string' && data.exception.trim()) return strip(data.exception);
    if (typeof data.message === 'string' && data.message.trim()) return strip(data.message);
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
