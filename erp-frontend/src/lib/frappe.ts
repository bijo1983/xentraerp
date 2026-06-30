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

  // ── Submit a draft document (docstatus 0 -> 1) ──────────────────
  async submitDoc(doctype: string, name: string) {
    return this.call('frappe.client.submit', {
      doc: JSON.stringify({ doctype, name }),
    });
  }
}

export const frappe = new FrappeClient();
