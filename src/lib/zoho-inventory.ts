type ZohoApiResponse<T> = {
  code?: number;
  message?: string;
} & T;

type ZohoLocation = {
  location_id?: string | number;
  location_name?: string;
  is_active?: boolean;
};

type ZohoItemLocation = {
  location_id?: string | number;
  location_available_stock?: number | string;
};

type ZohoItemWarehouse = {
  warehouse_id?: string | number;
  warehouse_name?: string;
  warehouse_available_stock?: number | string;
};

type ZohoItem = {
  item_id?: string | number;
  sku?: string;
  locations?: ZohoItemLocation[];
  warehouses?: ZohoItemWarehouse[];
};

type ZohoCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  locationIds: string[];
  accountsUrl: string;
  apiUrl: string;
};

export type ZohoStockUpdate = {
  sku: string | null;
  zoho_product_id: string;
  stock: number;
  product_id?: number;
  size?: string;
};

export class ZohoInventoryError extends Error {}

const normalizeSku = (sku: string) => sku.trim().toUpperCase();
const normalizeLocationName = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleUpperCase();
const normalizeUrl = (value: string) => value.replace(/\/+$/, "");
const inventoryApiPath = "inventory/v1/";
const requestTimeoutMs = 15_000;
const maxRequestAttempts = 3;
const isZohoAccountsHost = (hostname: string) => /^accounts\.zoho\.(com|eu|in|com\.au|jp|ca|sa|com\.cn)$/i.test(hostname);
const isZohoApiHost = (hostname: string) => /^(www\.)?zohoapis\.(com|eu|in|com\.au|jp|ca|sa|com\.cn)$/i.test(hostname);

const fetchZoho = async (url: URL, init: RequestInit) => {
  for (let attempt = 0; attempt < maxRequestAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch (error) {
      if (attempt === maxRequestAttempts - 1) {
        throw new ZohoInventoryError(error instanceof Error && error.name === "TimeoutError"
          ? "Zoho inventory request timed out."
          : "Unable to reach Zoho Inventory.");
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < maxRequestAttempts - 1) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5_000)
        : 250 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    return response;
  }

  throw new ZohoInventoryError("Zoho inventory request failed after multiple attempts.");
};

const parseZohoResponse = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    throw new ZohoInventoryError("Zoho returned an invalid response.");
  }
};

const getCredentials = (): ZohoCredentials => {
  const clientId = process.env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN?.trim();
  const organizationId = process.env.ZOHO_ORGANIZATION_ID?.trim();
  const locationIds = process.env.ZOHO_LOCATION_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  const accountsUrl = normalizeUrl(process.env.ZOHO_ACCOUNTS_URL?.trim() || "https://accounts.zoho.com");
  const apiUrl = normalizeUrl(process.env.ZOHO_API_URL?.trim() || "https://www.zohoapis.com");

  if (!clientId || !clientSecret || !refreshToken || !organizationId || locationIds.length === 0) {
    throw new ZohoInventoryError("Zoho inventory configuration is incomplete.");
  }

  if (new Set(locationIds).size !== locationIds.length) {
    throw new ZohoInventoryError("ZOHO_LOCATION_IDS contains duplicate location IDs.");
  }

  for (const [value, isValidHost] of [[accountsUrl, isZohoAccountsHost], [apiUrl, isZohoApiHost]] as const) {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.pathname !== "/"
      || url.search
      || url.hash
      || url.username
      || url.password
      || !isValidHost(url.hostname)
    ) {
      throw new ZohoInventoryError("Zoho account and API URLs must use a supported HTTPS Zoho domain.");
    }
  }

  return { clientId, clientSecret, refreshToken, organizationId, locationIds, accountsUrl, apiUrl };
};

const getAccessToken = async (credentials: ZohoCredentials) => {
  const tokenUrl = new URL("/oauth/v2/token", credentials.accountsUrl);
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetchZoho(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const result = await parseZohoResponse<{
    access_token?: string;
    api_domain?: string;
    error?: string;
  }>(response);

  if (!response.ok || !result.access_token) {
    throw new ZohoInventoryError(`Zoho OAuth failed${result.error ? ` (${result.error})` : ""}.`);
  }

  const apiUrl = normalizeUrl(result.api_domain || credentials.apiUrl);
  const parsedApiUrl = new URL(apiUrl);
  if (
    parsedApiUrl.protocol !== "https:"
    || parsedApiUrl.pathname !== "/"
    || parsedApiUrl.search
    || parsedApiUrl.hash
    || !isZohoApiHost(parsedApiUrl.hostname)
  ) {
    throw new ZohoInventoryError("Zoho returned an invalid API domain.");
  }

  return { accessToken: result.access_token, apiUrl };
};

const zohoGet = async <T>(
  apiUrl: string,
  accessToken: string,
  path: string,
  parameters: Record<string, string>,
): Promise<T> => {
  const url = new URL(path.replace(/^\/+/, ""), new URL(inventoryApiPath, `${apiUrl}/`));
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchZoho(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    cache: "no-store",
  });
  const result = await parseZohoResponse<ZohoApiResponse<T>>(response);

  if (!response.ok || result.code !== 0) {
    throw new ZohoInventoryError(`Zoho inventory API request failed${result.message ? ` (${result.message})` : ""}.`);
  }

  return result;
};

const getLocations = async (credentials: ZohoCredentials, apiUrl: string, accessToken: string) => {
  const result = await zohoGet<{ locations?: ZohoLocation[] }>(apiUrl, accessToken, "locations", {
    organization_id: credentials.organizationId,
  });
  const locationsById = new Map((result.locations ?? [])
    .filter((location) => location.location_id !== undefined && location.location_id !== null)
    .map((location) => [String(location.location_id), location]));
  const availableIds = new Set(locationsById.keys());
  const missingIds = credentials.locationIds.filter((id) => !availableIds.has(id));

  if (missingIds.length > 0) {
    throw new ZohoInventoryError(`Configured Zoho location IDs were not found: ${missingIds.join(", ")}.`);
  }
  return locationsById;
};

const getItems = async (credentials: ZohoCredentials, apiUrl: string, accessToken: string) => {
  const items: ZohoItem[] = [];
  let page = 1;

  while (page <= 100) {
    const result = await zohoGet<{
      items?: ZohoItem[];
      page_context?: { has_more_page?: boolean };
    }>(apiUrl, accessToken, "items", {
      organization_id: credentials.organizationId,
      page: String(page),
      per_page: "200",
    });
    const pageItems = result.items;
    if (!Array.isArray(pageItems)) {
      throw new ZohoInventoryError("Zoho returned an invalid item list.");
    }
    items.push(...pageItems);
    if (result.page_context?.has_more_page === true) {
      page += 1;
      continue;
    }
    if (result.page_context?.has_more_page === false || pageItems.length < 200) return items;
    throw new ZohoInventoryError("Zoho returned an incomplete item page without pagination details.");
  }

  throw new ZohoInventoryError("Zoho item pagination exceeded the safety limit.");
};

const getItemDetails = async (
  credentials: ZohoCredentials,
  apiUrl: string,
  accessToken: string,
  items: ZohoItem[],
) => {
  const detailedItems: ZohoItem[] = [];

  for (let index = 0; index < items.length; index += 5) {
    const batch = items.slice(index, index + 5);
    const details = await Promise.all(batch.map(async (item) => {
      if (item.item_id === undefined || item.item_id === null) {
        throw new ZohoInventoryError(`Zoho did not return an item ID for SKU ${item.sku ?? "(unknown)"}.`);
      }

      const result = await zohoGet<{ item?: ZohoItem }>(
        apiUrl,
        accessToken,
        `items/${encodeURIComponent(String(item.item_id))}`,
        { organization_id: credentials.organizationId },
      );
      if (!result.item || normalizeSku(result.item.sku ?? "") !== normalizeSku(item.sku ?? "")) {
        throw new ZohoInventoryError(`Zoho item details did not match SKU ${item.sku ?? "(unknown)"}.`);
      }
      return result.item;
    }));
    detailedItems.push(...details);
  }

  return detailedItems;
};
export const getZohoStockUpdates = async (
  websiteProducts: Array<{
    id?: number;
    product_type?: string | null;
    sku: string | null;
    zoho_product_id?: string | null;
    zoho_size_skus?: Record<string, string> | null;
    zoho_size_item_ids?: Record<string, string> | null;
  }>,
): Promise<ZohoStockUpdate[]> => {
  const productsByZohoId = new Map<string, { sku: string | null; zoho_product_id: string; product_id?: number; size?: string }>();
  const productsBySku = new Map<string, { sku: string | null; zoho_product_id: string; product_id?: number; size?: string }>();
  const addSkuMapping = (sku: string, mapping: { sku: string | null; zoho_product_id: string; product_id?: number; size?: string }) => {
    const key = normalizeSku(sku);
    if (productsBySku.has(key)) {
      throw new ZohoInventoryError(`Website products contain duplicate Zoho SKU mapping ${key}.`);
    }
    productsBySku.set(key, mapping);
  };
  const addZohoIdMapping = (zohoProductId: string, mapping: { sku: string | null; zoho_product_id: string; product_id?: number; size?: string }) => {
    if (productsByZohoId.has(zohoProductId)) {
      throw new ZohoInventoryError(`Website products contain duplicate Zoho item ID mapping ${zohoProductId}.`);
    }
    productsByZohoId.set(zohoProductId, mapping);
  };
  for (const product of websiteProducts) {
    const zohoProductId = product.product_type === "shoe" ? "" : product.zoho_product_id?.trim() || "";
    const sku = product.product_type === "shoe" ? "" : product.sku?.trim() || "";
    const sizeSkus = product.zoho_size_skus ?? {};
    const sizeItemIds = product.zoho_size_item_ids ?? {};
    for (const [size, sizeSku] of Object.entries(sizeSkus)) {
      if (sizeSku.trim()) {
        const mapping = {
          sku: sizeSku.trim(),
          zoho_product_id: "",
          ...(product.id !== undefined ? { product_id: product.id } : {}),
          size,
        };
        const zohoItemId = sizeItemIds[size]?.trim();
        if (zohoItemId) addZohoIdMapping(zohoItemId, mapping);
        addSkuMapping(sizeSku, mapping);
      }
    }
    if (zohoProductId) addZohoIdMapping(zohoProductId, {
      sku: sku || null,
      zoho_product_id: zohoProductId,
      ...(product.id !== undefined ? { product_id: product.id } : {}),
    });
    else if (sku && product.product_type !== "shoe" && Object.keys(sizeSkus).length === 0) {
      addSkuMapping(sku, { sku, zoho_product_id: "", ...(product.id !== undefined ? { product_id: product.id } : {}) });
    }
  }
  if (productsByZohoId.size === 0 && productsBySku.size === 0) return [];

  const credentials = getCredentials();
  const { accessToken, apiUrl } = await getAccessToken(credentials);
  const locationsById = await getLocations(credentials, apiUrl, accessToken);
  const items = await getItems(credentials, apiUrl, accessToken);
  const matchingItems = new Map<string, {
    item: ZohoItem;
    product: { sku: string | null; zoho_product_id: string; product_id?: number; size?: string };
  }>();

  for (const item of items) {
    const itemId = item.item_id === undefined || item.item_id === null ? "" : String(item.item_id);
    const sku = normalizeSku(item.sku ?? "");
    const product = productsByZohoId.get(itemId) ?? productsBySku.get(sku);
    if (!product) continue;
    const key = product.zoho_product_id || `sku:${sku}`;
    if (matchingItems.has(key)) {
      throw new ZohoInventoryError(`Zoho contains more than one item matching ${product.zoho_product_id ? `ID ${product.zoho_product_id}` : `SKU ${sku}`}.`);
    }
    matchingItems.set(key, { item, product });
  }

  const itemsNeedingDetails = Array.from(matchingItems.values())
    .map(({ item }) => item)
    .filter((item) => !Array.isArray(item.locations) && !Array.isArray(item.warehouses));
  const detailedItems = await getItemDetails(credentials, apiUrl, accessToken, itemsNeedingDetails);
  detailedItems.forEach((item) => {
    const itemId = item.item_id === undefined || item.item_id === null ? "" : String(item.item_id);
    const existing = matchingItems.get(itemId) ?? matchingItems.get(`sku:${normalizeSku(item.sku ?? "")}`);
    if (existing) matchingItems.set(existing.product.zoho_product_id || `sku:${normalizeSku(item.sku ?? "")}`, { ...existing, item });
  });

  const updates: ZohoStockUpdate[] = [];
  for (const [key, { item, product }] of matchingItems) {
    if (item.item_id === undefined || item.item_id === null || !String(item.item_id).trim()) {
      throw new ZohoInventoryError(`Zoho did not return an item ID for ${product.sku ? `SKU ${product.sku}` : "a mapped item"}.`);
    }
    const sku = product.sku ?? item.sku ?? key.replace(/^sku:/, "");
    if (!Array.isArray(item.locations) && !Array.isArray(item.warehouses)) {
      throw new ZohoInventoryError(`Zoho did not return warehouse stock details for SKU ${sku}. No stock was changed.`);
    }
    let availableStock = 0;
    const stockByLocation = Array.isArray(item.locations)
      ? credentials.locationIds.map((locationId) => ({
        locationId,
        quantity: item.locations?.find((location) => String(location.location_id ?? "") === locationId)?.location_available_stock,
        matches: item.locations?.filter((location) => String(location.location_id ?? "") === locationId).length ?? 0,
      }))
      : credentials.locationIds.map((locationId) => {
        const location = locationsById.get(locationId);
        const locationName = location?.location_name;
        if (!locationName?.trim()) {
          throw new ZohoInventoryError(`Zoho did not return a name for configured location ${locationId}; warehouse stock for SKU ${sku} cannot be matched safely.`);
        }
        const matches = (item.warehouses ?? []).filter((warehouse) => (
          typeof warehouse.warehouse_name === "string"
          && normalizeLocationName(warehouse.warehouse_name) === normalizeLocationName(locationName)
        ));
        return {
          locationId,
          quantity: matches[0]?.warehouse_available_stock,
          matches: matches.length,
        };
      });

    for (const { quantity: quantityValue, matches } of stockByLocation) {
      if (matches > 1) {
        throw new ZohoInventoryError(`Zoho returned duplicate warehouse stock for SKU ${sku}.`);
      }
      if (matches === 0) {
        throw new ZohoInventoryError(`Zoho did not return stock details for every configured location for SKU ${sku}. No stock was changed.`);
      }
      if (
        (typeof quantityValue !== "number" && typeof quantityValue !== "string")
        || (typeof quantityValue === "string" && quantityValue.trim() === "")
        || !Number.isFinite(Number(quantityValue))
      ) {
        throw new ZohoInventoryError(`Zoho returned an invalid available-stock quantity for SKU ${sku}. No stock was changed.`);
      }
      const quantity = Number(quantityValue);
      availableStock += quantity;
    }

    updates.push({
      sku: product.sku,
      zoho_product_id: String(item.item_id),
      stock: Math.max(0, Math.floor(availableStock)),
      ...(product.product_id !== undefined ? { product_id: product.product_id } : {}),
      ...(product.size ? { size: product.size } : {}),
    });
  }

  return updates;
};

export const normalizeZohoSku = normalizeSku;
