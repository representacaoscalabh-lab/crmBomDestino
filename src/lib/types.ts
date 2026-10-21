export type Customer = {
  id: string;
  code: string;
  name: string;
  store: string;
  city: string;
  status: "Ativo" | "Inativo" | "Prospect";
  fantasyName?: string;
  document?: string;
  segment?: string;
  paymentTerm?: string;
  representative?: string;
  lastPurchase?: string;
  state?: string;
  address?: string;
  neighborhood?: string;
  phone?: string;
  email?: string;
  groupId?: string;
};

export type CustomerGroup = {
  id: string;
  name: string;
  commissionPercent?: number;
  sellerCommissionPercent?: number;
  sellerCommissionBase?: "orders" | "representation";
  /** Store id -> seller name. These stores do not contribute to our dashboard. */
  externalStoreSellers?: Record<string, string>;
};

export type Product = {
  id: string;
  codeBox: string;
  codeHalfBox: string;
  description: string;
  quantityPerBox: number;
  weightPerBox: number;
  pricePerBox: number;
  status: "Ativo" | "Inativo";
  measure?: "KG" | "UN";
  unitWeight?: number;
  unitPrice?: number;
  weightType?: "Variável" | "Fixo";
  expiration?: string;
  associated?: string;
};

export type OrderItem = {
  /** Canonical product document id shared by box and half-box codes. */
  productId: string;
  productCode: string;
  description: string;
  packageKind: "Caixa" | "Meia caixa";
  packageQuantity: number;
  unitQuantity: number;
  packagePrice: number;
  /** Price for one individual unit. */
  unitPrice?: number;
  totalWeight: number;
  discountPercent?: number;
  subtotal?: number;
  boxQuantity?: number;
  pieces?: number;
  netWeight?: number;
  grossWeight?: number;
};

export type PaymentTerm = { id: string; code: string; term: string };

export type Goal = {
  id: string;
  title: string;
  type: "Mensal" | "Anual";
  year: number;
  month?: number;
  targetRevenue: number;
  targetKg: number;
  targetCustomers: number;
  targetConversion: number;
  status: "Ativa" | "Inativa";
};

export type Order = {
  /** Number of source orders represented by a dashboard daily aggregate. */
  recordCount?: number;
  id: string;
  preOrder: string;
  issueDate: string;
  invoice: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  store: string;
  customerCity?: string;
  paymentTerm?: string;
  status: "normal";
  items: OrderItem[];
  totalValue: number;
  totalWeight: number;
};

export type Bonification = {
  id: string;
  bonusNumber: string;
  issueDate: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  store: string;
  customerCity?: string;
  reason: string;
  notes: string;
  items: OrderItem[];
  totalValue: number;
  totalWeight: number;
};

export type NewProduct = Omit<Product, "id" | "measure" | "unitWeight" | "unitPrice" | "weightType" | "expiration" | "associated"> & {
  measure: "KG" | "UN";
  unitWeight: number;
  unitPrice: number;
  weightType: "Variável" | "Fixo";
  expiration: string;
  associated: string;
};
export type NewCustomer = Omit<Customer, "id">;
