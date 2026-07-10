export type CreateOrderInput = {
  customerId: string;
  sku: string;
  quantity: number;
};

export type CreatedOrder = {
  orderId: string;
  status: "accepted" | "rejected";
};

export function createOrder(input: CreateOrderInput): CreatedOrder {
  if (!input.customerId || !input.sku || input.quantity <= 0) {
    return { orderId: "none", status: "rejected" };
  }

  return {
    orderId: `order-${input.customerId}-${input.sku}`,
    status: "accepted",
  };
}
