export const DELIVERY_FEE_FILS = 1000;
export const HANDLING_FEE_FILS = 200;

export type CouponForValidation = {
  code: string;
  discount_type: string;
  discount_amount: number | string;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  minimum_subtotal: number | string | null;
  maximum_redemptions: number | null;
  redemption_count: number;
  reserved_redemptions: number;
};

export function toFils(amount: number | string) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) throw new Error("Invalid currency amount.");
  return Math.round(parsedAmount * 100);
}

export function fromFils(amount: number) {
  return amount / 100;
}

export function validateCouponEligibility(
  coupon: CouponForValidation | null,
  subtotalFils: number,
  now = new Date(),
) {
  if (!coupon) return { error: "That coupon code was not found." } as const;
  if (!coupon.is_active) return { error: "That coupon is inactive." } as const;
  if (coupon.starts_at && new Date(`${coupon.starts_at}T00:00:00.000Z`) > now) {
    return { error: "That coupon is not active yet." } as const;
  }
  if (coupon.expires_at && new Date(`${coupon.expires_at}T23:59:59.999Z`) < now) {
    return { error: "That coupon has expired." } as const;
  }
  if (coupon.maximum_redemptions !== null
    && coupon.redemption_count + coupon.reserved_redemptions >= coupon.maximum_redemptions) {
    return { error: "That coupon has reached its redemption limit." } as const;
  }

  const minimumSubtotalFils = coupon.minimum_subtotal === null ? 0 : toFils(coupon.minimum_subtotal);
  if (subtotalFils < minimumSubtotalFils) {
    return { error: `Add items worth AED ${fromFils(minimumSubtotalFils).toFixed(2)} or more to use this coupon.` } as const;
  }

  const configuredDiscountFils = toFils(coupon.discount_amount);
  if (coupon.discount_type !== "fixed" || configuredDiscountFils <= 0) {
    return { error: "That coupon is not configured correctly." } as const;
  }

  return {
    discountFils: Math.min(configuredDiscountFils, subtotalFils),
    code: coupon.code,
  } as const;
}

export function calculateCheckoutTotals(subtotalFils: number, discountFils = 0) {
  const safeSubtotalFils = Math.max(0, Math.round(subtotalFils));
  const safeDiscountFils = Math.min(safeSubtotalFils, Math.max(0, Math.round(discountFils)));
  const beforeDiscountFils = safeSubtotalFils + DELIVERY_FEE_FILS + HANDLING_FEE_FILS;

  return {
    subtotalFils: safeSubtotalFils,
    deliveryFeeFils: DELIVERY_FEE_FILS,
    handlingFeeFils: HANDLING_FEE_FILS,
    discountFils: safeDiscountFils,
    totalFils: Math.max(0, beforeDiscountFils - safeDiscountFils),
  };
}
