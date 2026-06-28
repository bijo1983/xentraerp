export interface User {
  name: string;
  email: string;
  full_name: string;
  user_image?: string;
  roles: string[];
}

export interface SalesOrder {
  name: string;
  customer: string;
  transaction_date: string;
  delivery_date: string;
  grand_total: number;
  status: string;
  currency: string;
  items: SalesOrderItem[];
}

export interface SalesOrderItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Customer {
  name: string;
  customer_name: string;
  customer_type: string;
  customer_group: string;
  territory: string;
}

export interface Item {
  name: string;
  item_code: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  standard_rate: number;
  image?: string;
}

export interface KPIData {
  total_revenue: number;
  total_orders: number;
  pending_orders: number;
  total_customers: number;
  revenue_trend: { date: string; amount: number }[];
  top_items: { item_name: string; qty: number; amount: number }[];
  order_status_distribution: { status: string; count: number }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
