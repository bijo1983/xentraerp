import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_ERP_URL || '';
const ERP_HOST = process.env.NEXT_PUBLIC_ERP_HOST || '';

class FrappeClient {
  private http: AxiosInstance;

  constructor() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (ERP_HOST) {
      headers['Host'] = ERP_HOST;
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      withCredentials: true,
      headers,
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
    const res = await this.http.post('/api/method/login', { usr, pwd });
    return res.data;
  }

  async logout() {
    const res = await this.http.post('/api/method/logout');
    this.clearToken();
    return res.data;
  }

  async getLoggedUser() {
    const res = await this.http.get('/api/method/frappe.auth.get_logged_user');
    return res.data.message;
  }

  // ── Generic CRUD (Frappe REST) ──────────────────────────────────
  async getList(doctype: string, params?: Record<string, unknown>) {
    const res = await this.http.get(`/api/resource/${doctype}`, { params });
    return res.data.data;
  }

  async getDoc(doctype: string, name: string) {
    const res = await this.http.get(`/api/resource/${doctype}/${name}`);
    return res.data.data;
  }

  async createDoc(doctype: string, data: Record<string, unknown>) {
    const res = await this.http.post(`/api/resource/${doctype}`, data);
    return res.data.data;
  }

  async updateDoc(doctype: string, name: string, data: Record<string, unknown>) {
    const res = await this.http.put(`/api/resource/${doctype}/${name}`, data);
    return res.data.data;
  }

  async deleteDoc(doctype: string, name: string) {
    const res = await this.http.delete(`/api/resource/${doctype}/${name}`);
    return res.data;
  }

  // ── Custom API Methods ──────────────────────────────────────────
  async call(method: string, args?: Record<string, unknown>) {
    const res = await this.http.post(`/api/method/${method}`, args);
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
}

export const frappe = new FrappeClient();
