export type CustomerTier = "guest" | "member" | "vip";

export type DiscountInput = {
  subtotal: number;
  tier: CustomerTier;
  couponCode?: string;
};

export function calculateDiscount(input: DiscountInput): number {
  if (input.subtotal < 50) {
    return 0;
  }

  let discount = 0;

  if (input.tier === "member") {
    discount += 0.05;
  }

  if (input.tier === "vip") {
    discount += 0.12;
  }

  if (input.couponCode === "SPRING10") {
    discount += 0.1;
  }

  return Math.min(discount, 0.25);
}
