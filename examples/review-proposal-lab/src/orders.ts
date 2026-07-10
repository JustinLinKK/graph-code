import { calculateDiscount, type CustomerTier } from "./discount";

export type OrderLine = {
  sku: string;
  quantity: number;
  unitPrice: number;
};

export type OrderRequest = {
  customerId: string;
  tier: CustomerTier;
  couponCode?: string;
  lines: OrderLine[];
};

export type PricedOrder = {
  customerId: string;
  subtotal: number;
  discountRate: number;
  total: number;
};

export function priceOrder(request: OrderRequest): PricedOrder {
  const subtotal = request.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const discountRate = calculateDiscount({
    subtotal,
    tier: request.tier,
    couponCode: request.couponCode,
  });

  return {
    customerId: request.customerId,
    subtotal,
    discountRate,
    total: Number((subtotal * (1 - discountRate)).toFixed(2)),
  };
}
