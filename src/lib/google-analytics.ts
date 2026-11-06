type AnalyticsProduct = {
  id: number;
  name: string;
  brand: string;
  category: string;
  price: number;
};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function trackEcommerceEvent(
  eventName: "page_view" | "view_item" | "add_to_cart" | "purchase",
  ecommerce: Record<string, unknown>,
) {
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
  if (typeof window === "undefined" || !measurementId || !/^G-[A-Z0-9]+$/.test(measurementId)) return;

  window.dataLayer ??= [];
  window.gtag ??= (...args) => window.dataLayer.push(args);
  window.gtag("event", eventName, ecommerce);
}

export function toAnalyticsItem(product: AnalyticsProduct, quantity = 1, variant?: string) {
  return {
    item_id: String(product.id),
    item_name: product.name,
    item_brand: product.brand,
    item_category: product.category,
    price: product.price,
    quantity,
    ...(variant ? { item_variant: variant } : {}),
  };
}
