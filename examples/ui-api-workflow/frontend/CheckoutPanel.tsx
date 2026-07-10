import { useState } from "react";
import { submitOrder, type CheckoutDraft } from "./apiClient";

export function CheckoutPanel() {
  const [sku, setSku] = useState("demo-book");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("idle");

  async function handleSubmit() {
    const draft: CheckoutDraft = {
      customerId: "demo-customer",
      sku,
      quantity,
    };
    const result = await submitOrder(draft);
    setStatus(result.status);
  }

  return (
    <section>
      <input value={sku} onChange={(event) => setSku(event.target.value)} />
      <input
        value={quantity}
        type="number"
        onChange={(event) => setQuantity(Number(event.target.value))}
      />
      <button onClick={handleSubmit}>Submit order</button>
      <span>{status}</span>
    </section>
  );
}
