export type OrderEvent = {
  orderId: string;
  customerId: string;
  totalCents: number;
  currency: "USD" | "EUR";
  lineCount: number;
};

export type Receipt = {
  orderId: string;
  chargedCents: number;
  message: string;
};
