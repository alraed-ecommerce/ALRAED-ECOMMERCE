export type ZohoStockStatus = "manual" | "verified" | "unavailable";

type ZohoStockProduct = {
  product_type?: string | null;
  name?: string | null;
  sku?: string | null;
  zoho_product_id?: string | null;
  zoho_stock_synced_at?: string | null;
  zoho_size_skus?: Record<string, string> | null;
  zoho_size_item_ids?: Record<string, string> | null;
  zoho_size_stock_synced_at?: Record<string, string> | null;
};

export function isZohoStockSyncEnabled(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    env.ZOHO_CLIENT_ID?.trim()
    || env.ZOHO_CLIENT_SECRET?.trim()
    || env.ZOHO_REFRESH_TOKEN?.trim()
    || env.ZOHO_ORGANIZATION_ID?.trim()
    || env.ZOHO_LOCATION_IDS?.trim(),
  );
}

export function getZohoStockMaxAgeMs(env: NodeJS.ProcessEnv = process.env) {
  const seconds = Number(env.ZOHO_STOCK_MAX_AGE_SECONDS);
  return Number.isInteger(seconds) && seconds >= 60 && seconds <= 86_400
    ? seconds * 1_000
    : 15 * 60 * 1_000;
}

export function getZohoLowStockThreshold(env: NodeJS.ProcessEnv = process.env) {
  const threshold = Number(env.ZOHO_LOW_STOCK_THRESHOLD);
  return Number.isInteger(threshold) && threshold >= 0 && threshold <= 1_000
    ? threshold
    : 3;
}

export function isZohoStockFresh(
  syncedAt: string | null | undefined,
  maxAgeMs = getZohoStockMaxAgeMs(),
  now = Date.now(),
) {
  if (!syncedAt) return false;
  const timestamp = Date.parse(syncedAt);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= maxAgeMs;
}

export function isZohoStockSynced(syncedAt: string | null | undefined, now = Date.now()) {
  if (!syncedAt) return false;
  const timestamp = Date.parse(syncedAt);
  return Number.isFinite(timestamp) && timestamp <= now;
}

export function getZohoStockStatus(product: ZohoStockProduct, now = Date.now()): ZohoStockStatus {
  if (!isZohoStockSyncEnabled()) return "manual";

  const sizeMappings = Object.entries(product.zoho_size_skus ?? {}).filter(([, sku]) => sku.trim());
  if (product.product_type === "shoe" || sizeMappings.length > 0) {
    const mappings = sizeMappings;
    return mappings.some(([size]) => isZohoSizeStockSynced(product, size, now)) ? "verified" : "unavailable";
  }

  if (!(product.sku?.trim() || product.zoho_product_id?.trim())) return "unavailable";
  return isZohoStockSynced(product.zoho_stock_synced_at, now)
    ? "verified"
    : "unavailable";
}

export function isZohoSizeStockSynced(product: ZohoStockProduct, size: string, now = Date.now()) {
  const sku = product.zoho_size_skus?.[size];
  if (!sku?.trim()) return false;
  return isZohoStockSynced(product.zoho_size_stock_synced_at?.[size], now);
}
