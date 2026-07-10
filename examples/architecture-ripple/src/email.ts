import type { OrderEvent, Receipt } from "./contracts";

export function buildReceiptEmail(event: OrderEvent, receipt: Receipt): string {
  const formattedTotal = formatMoney(event.totalCents, event.currency);
  return [
    `Order ${event.orderId}`,
    `Items: ${event.lineCount}`,
    `Total: ${formattedTotal}`,
    receipt.message,
  ].join("\n");
}

function formatMoney(cents: number, currency: OrderEvent["currency"]): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}
