import assert from "node:assert/strict";
import test from "node:test";

const { getLowStockProducts, getOverdueOrders } = await import("../src/lib/order-operations.ts");

const now = Date.parse("2026-02-01T12:00:00.000Z");
const ago = (milliseconds) => new Date(now - milliseconds).toISOString();

test("processing alerts use confirmed payment time or the audited paid transition", () => {
  const overdueStripePayment = { status: "paid", stripe_paid_at: ago(25 * 60 * 60 * 1_000) };
  const overdueManualPayment = {
    status: "paid",
    status_history: [{ new_status: "paid", changed_at: ago(26 * 60 * 60 * 1_000) }],
  };
  const recentPayment = { status: "paid", stripe_paid_at: ago(23 * 60 * 60 * 1_000) };
  const paymentAtThreshold = { status: "paid", stripe_paid_at: ago(24 * 60 * 60 * 1_000) };
  const legacyPaymentWithoutTimestamp = { status: "paid" };

  assert.deepEqual(getOverdueOrders(
    [overdueStripePayment, overdueManualPayment, recentPayment, paymentAtThreshold, legacyPaymentWithoutTimestamp],
    now,
  ).processing, [overdueStripePayment, overdueManualPayment]);
});

test("delivery alerts require an audited shipped transition and the three-day threshold", () => {
  const overdueDelivery = {
    status: "shipped",
    status_history: [{ new_status: "shipped", changed_at: ago(4 * 24 * 60 * 60 * 1_000) }],
  };
  const recentDelivery = {
    status: "shipped",
    status_history: [{ new_status: "shipped", changed_at: ago(2 * 24 * 60 * 60 * 1_000) }],
  };
  const legacyDeliveryWithoutTimestamp = { status: "shipped" };

  assert.deepEqual(getOverdueOrders(
    [overdueDelivery, recentDelivery, legacyDeliveryWithoutTimestamp],
    now,
  ).delivery, [overdueDelivery]);
});

test("low-stock alerts include active products at or below the threshold", () => {
  const products = [
    { id: 1, stock: 3, is_active: true },
    { id: 2, stock: 4, is_active: true },
    { id: 3, stock: 0, is_active: false },
  ];

  assert.deepEqual(getLowStockProducts(products, 3), [products[0]]);
});
