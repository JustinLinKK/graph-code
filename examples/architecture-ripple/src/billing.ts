import type { OrderEvent, Receipt } from "./contracts";

export function capturePayment(event: OrderEvent): Receipt {
  const feeCents = event.currency === "USD" ? 30 : 45;
  return {
    orderId: event.orderId,
    chargedCents: event.totalCents + feeCents,
    message: `Captured ${event.currency} payment for ${event.orderId}`,
  };
}

export function refundPayment(event: OrderEvent): Receipt {
  return {
    orderId: event.orderId,
    chargedCents: -event.totalCents,
    message: `Refunded ${event.currency} payment for ${event.orderId}`,
  };
}
