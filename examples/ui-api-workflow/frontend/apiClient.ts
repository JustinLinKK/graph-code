export type CheckoutDraft = {
  customerId: string;
  sku: string;
  quantity: number;
};

export type CheckoutResult = {
  orderId: string;
  status: "accepted" | "rejected";
};

export async function submitOrder(
  draft: CheckoutDraft,
): Promise<CheckoutResult> {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    return { orderId: "none", status: "rejected" };
  }

  return response.json() as Promise<CheckoutResult>;
}
