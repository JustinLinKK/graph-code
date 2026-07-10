import type { OrderEvent, Receipt } from "./contracts";

export type AuditRecord = {
  entityId: string;
  action: string;
  metadata: Record<string, string>;
};

export function recordOrderAudit(event: OrderEvent, receipt: Receipt): AuditRecord {
  return {
    entityId: event.orderId,
    action: "order.payment.captured",
    metadata: {
      customerId: event.customerId,
      currency: event.currency,
      totalCents: String(event.totalCents),
      chargedCents: String(receipt.chargedCents),
    },
  };
}
