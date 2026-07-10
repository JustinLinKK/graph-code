import { calculateDiscount } from "./discount";
import { priceOrder } from "./orders";

export function testSmallOrdersDoNotReceiveLoyaltyDiscount(): void {
  const discount = calculateDiscount({ subtotal: 30, tier: "vip" });
  if (discount !== 0) {
    throw new Error(`Expected no discount for small orders, got ${discount}`);
  }
}

export function testCouponAndVipDiscountAreCapped(): void {
  const discount = calculateDiscount({
    subtotal: 120,
    tier: "vip",
    couponCode: "SPRING10",
  });
  if (discount !== 0.22) {
    throw new Error(`Expected 0.22 discount, got ${discount}`);
  }
}

export function testPriceOrderAppliesDiscount(): void {
  const order = priceOrder({
    customerId: "customer-1",
    tier: "member",
    lines: [{ sku: "book", quantity: 2, unitPrice: 30 }],
  });
  if (order.total !== 57) {
    throw new Error(`Expected total 57, got ${order.total}`);
  }
}
