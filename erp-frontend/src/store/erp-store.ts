import { create } from 'zustand';
import { frappe } from '@/lib/frappe';
import type { KPIData } from '@/types/erp';

interface ERPState {
  kpi: KPIData | null;
  kpiLoading: boolean;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  fetchKPI: () => Promise<void>;
}

export const useERPStore = create<ERPState>((set) => ({
  kpi: null,
  kpiLoading: false,
  sidebarOpen: true,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  fetchKPI: async () => {
    set({ kpiLoading: true });
    try {
      const data = await frappe.call('custom_erp.api.dashboard.get_kpi_data');
      set({ kpi: data, kpiLoading: false });
    } catch {
      set({ kpiLoading: false });
    }
  },
}));
