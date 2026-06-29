import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LogisticsConfig,
  LogisticsModel,
  Shipment,
  CarrierConfig,
  WarehouseConfig,
  ShippingZone,
  DEFAULT_CONFIGS,
} from '@/types/logistics';

interface LogisticsState {
  config: LogisticsConfig | null;
  setupComplete: boolean;
  shipments: Shipment[];
  shipmentsLoading: boolean;

  setConfig: (config: LogisticsConfig) => void;
  updateConfig: (partial: Partial<LogisticsConfig>) => void;
  initializeModel: (model: LogisticsModel) => void;
  completeSetup: () => void;
  resetSetup: () => void;

  addCarrier: (carrier: CarrierConfig) => void;
  removeCarrier: (id: string) => void;
  addWarehouse: (warehouse: WarehouseConfig) => void;
  removeWarehouse: (id: string) => void;
  addZone: (zone: ShippingZone) => void;
  removeZone: (id: string) => void;
}

const DEFAULT_MODEL_CONFIGS: Record<LogisticsModel, Partial<LogisticsConfig>> = {
  '1pl': {
    enable_warehousing: true,
    enable_transport: true,
    enable_customs: false,
    enable_freight_forwarding: false,
    enable_last_mile: true,
    enable_reverse_logistics: false,
    enable_cold_chain: false,
    enable_cross_docking: false,
  },
  '2pl': {
    enable_warehousing: true,
    enable_transport: true,
    enable_customs: false,
    enable_freight_forwarding: false,
    enable_last_mile: true,
    enable_reverse_logistics: true,
    enable_cold_chain: false,
    enable_cross_docking: false,
  },
  '3pl': {
    enable_warehousing: true,
    enable_transport: true,
    enable_customs: false,
    enable_freight_forwarding: true,
    enable_last_mile: true,
    enable_reverse_logistics: true,
    enable_cold_chain: true,
    enable_cross_docking: true,
  },
  '4pl': {
    enable_warehousing: true,
    enable_transport: true,
    enable_customs: true,
    enable_freight_forwarding: true,
    enable_last_mile: true,
    enable_reverse_logistics: true,
    enable_cold_chain: true,
    enable_cross_docking: true,
  },
};

export const useLogisticsStore = create<LogisticsState>()(
  persist(
    (set, get) => ({
      config: null,
      setupComplete: false,
      shipments: [],
      shipmentsLoading: false,

      setConfig: (config) => set({ config }),

      updateConfig: (partial) =>
        set((s) => ({
          config: s.config ? { ...s.config, ...partial } : null,
        })),

      initializeModel: (model) =>
        set({
          config: {
            model,
            company_name: '',
            default_currency: 'USD',
            country: '',
            tax_id: '',
            carriers: [],
            warehouses: [],
            zones: [],
            ...DEFAULT_MODEL_CONFIGS[model],
          } as LogisticsConfig,
        }),

      completeSetup: () => set({ setupComplete: true }),
      resetSetup: () => set({ config: null, setupComplete: false }),

      addCarrier: (carrier) =>
        set((s) => ({
          config: s.config
            ? { ...s.config, carriers: [...s.config.carriers, carrier] }
            : null,
        })),

      removeCarrier: (id) =>
        set((s) => ({
          config: s.config
            ? { ...s.config, carriers: s.config.carriers.filter((c) => c.id !== id) }
            : null,
        })),

      addWarehouse: (warehouse) =>
        set((s) => ({
          config: s.config
            ? { ...s.config, warehouses: [...s.config.warehouses, warehouse] }
            : null,
        })),

      removeWarehouse: (id) =>
        set((s) => ({
          config: s.config
            ? { ...s.config, warehouses: s.config.warehouses.filter((w) => w.id !== id) }
            : null,
        })),

      addZone: (zone) =>
        set((s) => ({
          config: s.config
            ? { ...s.config, zones: [...s.config.zones, zone] }
            : null,
        })),

      removeZone: (id) =>
        set((s) => ({
          config: s.config
            ? { ...s.config, zones: s.config.zones.filter((z) => z.id !== id) }
            : null,
        })),
    }),
    { name: 'xentra-logistics-config' }
  )
);
