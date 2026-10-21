import type { Order } from "./types";

/** Treat historical order classifications as regular orders. */
export function normalizeOrder(order: Order): Order {
  return { ...order, status: "normal" };
}
