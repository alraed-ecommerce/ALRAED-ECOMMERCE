import assert from "node:assert/strict";
import test from "node:test";

const { getOrderProgress, orderProgressSteps } = await import("../src/lib/order-progress.ts");

test("order progress reflects payment and fulfillment status", () => {
  assert.deepEqual(getOrderProgress("awaiting_payment"), {
    cancelled: false, activeStep: 1, completedSteps: 1,
  });
  assert.deepEqual(getOrderProgress("paid"), {
    cancelled: false, activeStep: 2, completedSteps: 2,
  });
  assert.deepEqual(getOrderProgress("processing"), {
    cancelled: false, activeStep: 2, completedSteps: 2,
  });
  assert.deepEqual(getOrderProgress("shipped"), {
    cancelled: false, activeStep: 3, completedSteps: 3,
  });
  assert.deepEqual(getOrderProgress("delivered"), {
    cancelled: false, activeStep: -1, completedSteps: orderProgressSteps.length,
  });
});

test("cancelled and unexpected statuses never appear delivered", () => {
  assert.equal(getOrderProgress("cancelled").cancelled, true);
  assert.deepEqual(getOrderProgress("unknown"), {
    cancelled: false, activeStep: 0, completedSteps: 0,
  });
});
