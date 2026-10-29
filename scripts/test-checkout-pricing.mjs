import assert from "node:assert/strict";
import test from "node:test";

const { calculateCheckoutTotals, validateCouponEligibility, toFils } = await import("../src/lib/checkout-pricing.ts");
const { parseCheckoutCart } = await import("../src/lib/checkout-cart.ts");
const { validateCouponInput } = await import("../src/lib/coupons.ts");

const activeCoupon = {
  code: "SAVE20",
  discount_type: "fixed",
  discount_amount: "20.00",
  is_active: true,
  starts_at: null,
  expires_at: null,
  minimum_subtotal: null,
  maximum_redemptions: null,
  redemption_count: 0,
  reserved_redemptions: 0,
};

test("uses integer fils for item and order totals", () => {
  assert.equal(toFils("12.34"), 1234);
  assert.deepEqual(calculateCheckoutTotals(25000, 2000), {
    subtotalFils: 25000,
    deliveryFeeFils: 0,
    handlingFeeFils: 0,
    discountFils: 2000,
    totalFils: 23000,
  });
});

test("applies both fees below AED 200 and waives both at AED 200 and above", () => {
  assert.deepEqual(calculateCheckoutTotals(19999), {
    subtotalFils: 19999,
    deliveryFeeFils: 1000,
    handlingFeeFils: 200,
    discountFils: 0,
    totalFils: 21199,
  });
  assert.deepEqual(calculateCheckoutTotals(20000), {
    subtotalFils: 20000,
    deliveryFeeFils: 0,
    handlingFeeFils: 0,
    discountFils: 0,
    totalFils: 20000,
  });
  assert.equal(calculateCheckoutTotals(20001).totalFils, 20001);
});

test("caps fixed coupon discount to the product subtotal", () => {
  const validation = validateCouponEligibility({ ...activeCoupon, discount_amount: "25.00" }, 1000);
  assert.deepEqual(validation, { code: "SAVE20", discountFils: 1000 });
  assert.equal(calculateCheckoutTotals(1000, validation.discountFils).totalFils, 1200);
});

test("rejects inactive, expired, not-yet-active, minimum, and exhausted coupons", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  assert.match(validateCouponEligibility({ ...activeCoupon, is_active: false }, 5000, now).error, /inactive/);
  assert.match(validateCouponEligibility({ ...activeCoupon, expires_at: "2026-10-28" }, 5000, now).error, /expired/);
  assert.match(validateCouponEligibility({ ...activeCoupon, starts_at: "2026-10-30" }, 5000, now).error, /not active yet/);
  assert.match(validateCouponEligibility({ ...activeCoupon, minimum_subtotal: 60 }, 5000, now).error, /AED 60.00/);
  assert.match(validateCouponEligibility({ ...activeCoupon, maximum_redemptions: 2, redemption_count: 1, reserved_redemptions: 1 }, 5000, now).error, /redemption limit/);
});

test("validates normalized coupon administration input", () => {
  const valid = validateCouponInput({
    code: "save20",
    discount_type: "fixed",
    discount_amount: "20.00",
    is_active: true,
    starts_at: "",
    expires_at: "",
  });
  assert.equal(valid.coupon?.code, "SAVE20");
  assert.equal(validateCouponInput({ ...valid.coupon, code: "bad code" }).error?.includes("Coupon codes"), true);
});

test("parses cart product ids and rejects malformed or excessive quantities", () => {
  assert.deepEqual(parseCheckoutCart([{ product: { id: 21 }, quantity: 2, size: "UK 8" }]).items, [
    { productId: 21, quantity: 2, size: "UK 8" },
  ]);
  assert.match(parseCheckoutCart([{ productId: 21, quantity: 30 }, { productId: 21, quantity: 21 }]).error, /cannot exceed 50/);
  assert.match(parseCheckoutCart([]).error, /empty/);
});
