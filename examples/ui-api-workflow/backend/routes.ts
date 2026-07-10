import { createOrder, type CreateOrderInput } from "./orders";

type RequestLike = {
  body: CreateOrderInput;
};

type ReplyLike = {
  status: (code: number) => ReplyLike;
  send: (body: unknown) => void;
};

export function registerOrderRoutes(app: {
  post: (path: string, handler: (request: RequestLike, reply: ReplyLike) => void) => void;
}) {
  app.post("/api/orders", (request, reply) => {
    const order = createOrder(request.body);
    if (order.status === "rejected") {
      reply.status(400).send(order);
      return;
    }
    reply.status(201).send(order);
  });
}
