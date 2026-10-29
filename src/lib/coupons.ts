export type CouponInput = {
  code: string;
  discount_type: "fixed";
  discount_amount: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  minimum_subtotal: number | null;
  maximum_redemptions: number | null;
};

export function validateCouponInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { coupon: null, error: "Enter valid coupon details." } as const;
  }
  const input = value as Record<string, unknown>;
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{1,40}$/.test(code)) {
    return { coupon: null, error: "Coupon codes must use 1–40 letters, numbers, hyphens, or underscores." } as const;
  }
  if (input.discount_type !== "fixed") {
    return { coupon: null, error: "Choose the fixed AED discount type." } as const;
  }

  const amount = Number(input.discount_amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    return { coupon: null, error: "Enter a discount amount greater than AED 0.00 with up to two decimal places." } as const;
  }
  if (typeof input.is_active !== "boolean") {
    return { coupon: null, error: "Choose whether this coupon is active." } as const;
  }

  const parseDate = (field: "starts_at" | "expires_at") => {
    const date = input[field];
    if (date === null || date === "" || date === undefined) return { value: null as string | null, error: null };
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
      return { value: null, error: `Enter a valid ${field === "starts_at" ? "start" : "expiry"} date.` };
    }
    return { value: date, error: null };
  };
  const startsAt = parseDate("starts_at");
  const expiresAt = parseDate("expires_at");
  if (startsAt.error || expiresAt.error) {
    return { coupon: null, error: startsAt.error || expiresAt.error } as const;
  }
  if (startsAt.value && expiresAt.value && startsAt.value > expiresAt.value) {
    return { coupon: null, error: "The expiry date must be on or after the start date." } as const;
  }

  const minimumSubtotal = input.minimum_subtotal === null || input.minimum_subtotal === "" || input.minimum_subtotal === undefined
    ? null
    : Number(input.minimum_subtotal);
  if (minimumSubtotal !== null
    && (!Number.isFinite(minimumSubtotal) || minimumSubtotal < 0 || Math.round(minimumSubtotal * 100) !== minimumSubtotal * 100)) {
    return { coupon: null, error: "Minimum subtotal must be AED 0.00 or more, with up to two decimal places." } as const;
  }

  const maximumRedemptions = input.maximum_redemptions === null || input.maximum_redemptions === "" || input.maximum_redemptions === undefined
    ? null
    : Number(input.maximum_redemptions);
  if (maximumRedemptions !== null && (!Number.isSafeInteger(maximumRedemptions) || maximumRedemptions < 1)) {
    return { coupon: null, error: "Maximum redemptions must be a whole number greater than zero." } as const;
  }

  return {
    coupon: {
      code,
      discount_type: "fixed",
      discount_amount: amount,
      is_active: input.is_active,
      starts_at: startsAt.value,
      expires_at: expiresAt.value,
      minimum_subtotal: minimumSubtotal,
      maximum_redemptions: maximumRedemptions,
    } satisfies CouponInput,
    error: null,
  } as const;
}
