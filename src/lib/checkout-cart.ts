export type CheckoutCartItem = {
  productId: number;
  quantity: number;
  color?: string;
  size?: string;
};

export function parseCheckoutCart(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    return { items: null, error: "Your shopping bag is empty or contains too many items." } as const;
  }

  const items: CheckoutCartItem[] = [];
  const quantitiesByProduct = new Map<number, number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return { items: null, error: "One or more items in your bag are invalid." } as const;
    }

    const item = entry as Record<string, unknown>;
    const productId = Number(item.productId ?? (item.product as Record<string, unknown> | null)?.id);
    const quantity = Number(item.quantity);
    const color = item.color === undefined ? undefined : typeof item.color === "string" ? item.color.trim() : null;
    const size = item.size === undefined ? undefined : typeof item.size === "string" ? item.size.trim() : null;
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 50
      || color === null || size === null || (color !== undefined && (!color || color.length > 40))
      || (size !== undefined && (!size || size.length > 40))) {
      return { items: null, error: "One or more items in your bag are invalid." } as const;
    }

    const combinedQuantity = (quantitiesByProduct.get(productId) ?? 0) + quantity;
    if (combinedQuantity > 50) {
      return { items: null, error: "The quantity for one product cannot exceed 50." } as const;
    }
    quantitiesByProduct.set(productId, combinedQuantity);
    items.push({ productId, quantity, ...(color ? { color } : {}), ...(size ? { size } : {}) });
  }

  return { items, error: null } as const;
}
