import axios, { AxiosInstance } from 'axios';

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
    const res = await this.http.get(`/api/erp/resource/${doctype}/${name}`);
    return res.data.data;
  }

  async createDoc(doctype: string, data: Record<string, unknown>) {
    const res = await this.http.post(`/api/erp/resource/${doctype}`, data);
    return res.data.data;
  }

  async updateDoc(doctype: string, name: string, data: Record<string, unknown>) {
    const res = await this.http.put(`/api/erp/resource/${doctype}/${name}`, data);
    return res.data.data;
  }

  async deleteDoc(doctype: string, name: string) {
    const res = await this.http.delete(`/api/erp/resource/${doctype}/${name}`);
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

  // ── Submit a draft document (docstatus 0 -> 1) ──────────────────
  async submitDoc(doctype: string, name: string) {
    return this.call('frappe.client.submit', {
      doc: JSON.stringify({ doctype, name }),
    });
  }

  // ── Cancel a submitted document (docstatus 1 -> 2) ──────────────
  async cancelDoc(doctype: string, name: string) {
    return this.call('frappe.client.cancel', { doctype, name });
  }

  // ── Amend a cancelled document (new draft from amended_from) ────
  async amendDoc(doctype: string, name: string) {
    const source = await this.getDoc(doctype, name);
    const { name: _omit, ...rest } = source as Record<string, unknown>;
    void _omit;
    return this.createDoc(doctype, {
      ...rest,
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
