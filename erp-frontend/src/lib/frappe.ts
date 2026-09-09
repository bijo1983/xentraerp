import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_ERP_URL || '';

class FrappeClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      withCredentials: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
    const res = await this.http.post(
      '/api/method/login',
      new URLSearchParams({ usr, pwd }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
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

  /**
   * The session cookie Set by /api/method/login isn't always guaranteed to
   * be attached to the very next request fired immediately afterward (seen
   * as a 403 on the first authenticated call post-login, which then
   * succeeds on retry). Poll get_logged_user with backoff until it reports
   * a real (non-Guest) user, so callers can be sure the session is truly
   * usable before navigating anywhere that depends on it.
   */
  async waitForSession(expectedUser?: string, attempts = 6, delayMs = 200): Promise<string> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const username = await this.getLoggedUser();
        if (username && username !== 'Guest' && (!expectedUser || username.toLowerCase() === expectedUser.toLowerCase())) {
          return username;
        }
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw lastErr instanceof Error ? lastErr : new Error('Session not established');
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
