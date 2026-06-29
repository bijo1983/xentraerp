export type LogisticsModel = '1pl' | '2pl' | '3pl' | '4pl';

export interface LogisticsConfig {
  model: LogisticsModel;
  company_name: string;
  enable_warehousing: boolean;
  enable_transport: boolean;
  enable_customs: boolean;
  enable_freight_forwarding: boolean;
  enable_last_mile: boolean;
  enable_reverse_logistics: boolean;
  enable_cold_chain: boolean;
  enable_cross_docking: boolean;
  default_currency: string;
  country: string;
  tax_id: string;
  carriers: CarrierConfig[];
  warehouses: WarehouseConfig[];
  zones: ShippingZone[];
}

export interface CarrierConfig {
  id: string;
  name: string;
  type: 'own_fleet' | 'contracted' | 'marketplace';
  tracking_enabled: boolean;
  api_key?: string;
  services: string[];
  active: boolean;
}

export interface WarehouseConfig {
  id: string;
  name: string;
  type: 'owned' | 'rented' | 'third_party';
  address: string;
  city: string;
  country: string;
  capacity_sqm: number;
  cold_storage: boolean;
  active: boolean;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  delivery_days_min: number;
  delivery_days_max: number;
  base_rate: number;
  per_kg_rate: number;
  currency: string;
}

export interface Shipment {
  id: string;
  tracking_number: string;
  status: ShipmentStatus;
  origin_warehouse: string;
  destination_address: string;
  carrier: string;
  service_type: string;
  weight_kg: number;
  dimensions?: { length: number; width: number; height: number };
  items: ShipmentItem[];
  estimated_delivery: string;
  actual_delivery?: string;
  shipping_cost: number;
  currency: string;
  created_at: string;
  updated_at: string;
  customer: string;
  sales_order?: string;
  purchase_order?: string;
}

export type ShipmentStatus =
  | 'draft'
  | 'pending_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'at_hub'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_delivery'
  | 'returned'
  | 'cancelled';

export interface ShipmentItem {
  item_code: string;
  item_name: string;
  qty: number;
  weight_kg: number;
}

export interface FreightQuote {
  carrier: string;
  service: string;
  rate: number;
  currency: string;
  estimated_days: number;
  valid_until: string;
}

export const LOGISTICS_MODEL_INFO: Record<LogisticsModel, {
  title: string;
  description: string;
  features: string[];
  ideal_for: string;
}> = {
  '1pl': {
    title: 'First-Party Logistics (1PL)',
    description: 'Manufacturer or seller handles all logistics in-house using own fleet and warehouses.',
    features: [
      'Own fleet management',
      'Own warehouse operations',
      'Direct delivery to customers',
      'Full control over supply chain',
    ],
    ideal_for: 'Companies with their own transport fleet and warehouse infrastructure',
  },
  '2pl': {
    title: 'Second-Party Logistics (2PL)',
    description: 'Outsource transportation to a carrier while managing warehousing in-house.',
    features: [
      'Contracted carriers for transport',
      'Own warehouse management',
      'Carrier rate management',
      'Multi-carrier support',
    ],
    ideal_for: 'Companies with warehouses but no transport fleet',
  },
  '3pl': {
    title: 'Third-Party Logistics (3PL)',
    description: 'Outsource warehousing, transportation, and fulfillment to a logistics provider.',
    features: [
      'Third-party warehousing',
      'Outsourced fulfillment',
      'Multi-carrier integration',
      'Returns management',
      'Inventory sync with 3PL',
    ],
    ideal_for: 'E-commerce and businesses wanting to focus on core operations',
  },
  '4pl': {
    title: 'Fourth-Party Logistics (4PL)',
    description: 'A lead logistics provider manages the entire supply chain including multiple 3PLs.',
    features: [
      'Supply chain orchestration',
      'Multi-3PL management',
      'Freight forwarding',
      'Customs brokerage',
      'Cross-border logistics',
      'Advanced analytics & optimization',
    ],
    ideal_for: 'Large enterprises with complex, global supply chains',
  },
};

export const DEFAULT_CONFIGS: Record<LogisticsModel, Partial<LogisticsConfig>> = {
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
