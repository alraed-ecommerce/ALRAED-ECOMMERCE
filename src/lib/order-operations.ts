export type OrderStatusHistoryEntry = {
  id: number;
  previous_status: string;
  new_status: string;
  changed_at: string;
  changed_by_email: string | null;
};

export type OrderWithStatusHistory = {
  status: string;
  stripe_paid_at?: string | null;
  status_history?: OrderStatusHistoryEntry[];
};

const getTransitionTime = (order: OrderWithStatusHistory, status: string) =>
  order.status_history?.find((entry) => entry.new_status === status)?.changed_at ?? null;

const isPastThreshold = (timestamp: string | null, thresholdMs: number, now: number) => {
  if (!timestamp) return false;
  const parsedTimestamp = Date.parse(timestamp);
  return Number.isFinite(parsedTimestamp) && now - parsedTimestamp > thresholdMs;
};

export function getOverdueOrders<T extends OrderWithStatusHistory>(
  orders: T[],
  now = Date.now(),
  processingThresholdHours = 24,
  deliveryThresholdDays = 3,
) {
  if (!Number.isFinite(now) || now <= 0) return { processing: [], delivery: [] };

  return {
    processing: orders.filter((order) => order.status === "paid"
      && isPastThreshold(
        order.stripe_paid_at ?? getTransitionTime(order, "paid"),
        processingThresholdHours * 60 * 60 * 1_000,
        now,
      )),
    delivery: orders.filter((order) => order.status === "shipped"
      && isPastThreshold(
        getTransitionTime(order, "shipped"),
        deliveryThresholdDays * 24 * 60 * 60 * 1_000,
        now,
      )),
  };
}

export function getLowStockProducts<T extends { is_active?: boolean; stock: number }>(
  products: T[],
  threshold: number,
) {
  return products.filter((product) => product.is_active === true
    && Number.isFinite(product.stock)
    && product.stock <= threshold);
}
