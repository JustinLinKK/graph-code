import { recordOrderAudit } from "./audit";
import { capturePayment } from "./billing";
import type { OrderEvent } from "./contracts";
import { buildReceiptEmail } from "./email";

export function completeOrder(event: OrderEvent): {
  receiptEmail: string;
  auditAction: string;
} {
  const receipt = capturePayment(event);
  const receiptEmail = buildReceiptEmail(event, receipt);
  const audit = recordOrderAudit(event, receipt);

  return {
    receiptEmail,
    auditAction: audit.action,
  };
}
