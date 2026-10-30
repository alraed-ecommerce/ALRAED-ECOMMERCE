import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;
const originalEnv = new Map([
  ["ZOHO_CLIENT_ID", process.env.ZOHO_CLIENT_ID],
  ["ZOHO_CLIENT_SECRET", process.env.ZOHO_CLIENT_SECRET],
  ["ZOHO_REFRESH_TOKEN", process.env.ZOHO_REFRESH_TOKEN],
  ["ZOHO_ORGANIZATION_ID", process.env.ZOHO_ORGANIZATION_ID],
  ["ZOHO_LOCATION_IDS", process.env.ZOHO_LOCATION_IDS],
  ["ZOHO_ACCOUNTS_URL", process.env.ZOHO_ACCOUNTS_URL],
  ["ZOHO_API_URL", process.env.ZOHO_API_URL],
  ["ZOHO_STOCK_MAX_AGE_SECONDS", process.env.ZOHO_STOCK_MAX_AGE_SECONDS],
  ["ZOHO_LOW_STOCK_THRESHOLD", process.env.ZOHO_LOW_STOCK_THRESHOLD],
]);

process.env.ZOHO_CLIENT_ID = "test-client";
process.env.ZOHO_CLIENT_SECRET = "test-secret";
process.env.ZOHO_REFRESH_TOKEN = "test-refresh-token";
process.env.ZOHO_ORGANIZATION_ID = "test-organization";
process.env.ZOHO_LOCATION_IDS = "location-1";
process.env.ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";
process.env.ZOHO_API_URL = "https://www.zohoapis.com";

const { getZohoStockUpdates, ZohoInventoryError } = await import("../src/lib/zoho-inventory.ts");
const { getZohoStockStatus, isZohoSizeStockFresh, isZohoStockFresh } = await import("../src/lib/zoho-stock-policy.ts");

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("retrieves available quantities only through versioned Zoho GET endpoints", async () => {
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, method: init.method ?? "GET" });

    if (url.hostname === "accounts.zoho.com") {
      return Response.json({ access_token: "mock-access-token", api_domain: "https://www.zohoapis.com" });
    }
    if (url.pathname === "/inventory/v1/locations") {
      return Response.json({ code: 0, locations: [{ location_id: "location-1" }] });
    }
    if (url.pathname === "/inventory/v1/items") {
      return Response.json({
        code: 0,
        items: [{ item_id: "item-1", sku: "SKU-1" }],
        page_context: { has_more_page: false },
      });
    }
    if (url.pathname === "/inventory/v1/items/item-1") {
      return Response.json({
        code: 0,
        item: {
          item_id: "item-1",
          sku: "SKU-1",
          locations: [{ location_id: "location-1", location_available_stock: "7" }],
        },
      });
    }
    throw new Error(`Unexpected Zoho endpoint: ${url.pathname}`);
  };

  assert.deepEqual(await getZohoStockUpdates([{ sku: " SKU-1 " }]), [{ sku: "SKU-1", zoho_product_id: "item-1", stock: 7 }]);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/oauth/v2/token");
  assert.ok(requests.slice(1).every(({ method, url }) => method === "GET" && url.pathname.startsWith("/inventory/v1/")));
});

test("does not make any Zoho requests when no website products are mapped", async () => {
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    throw new Error("Unexpected request");
  };

  assert.deepEqual(await getZohoStockUpdates([{ sku: null }]), []);
  assert.equal(requestCount, 0);
});

test("matches by stable Zoho item ID even when the Zoho SKU changes", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "accounts.zoho.com") {
      return Response.json({ access_token: "mock-access-token", api_domain: "https://www.zohoapis.com" });
    }
    if (url.pathname === "/inventory/v1/locations") {
      return Response.json({ code: 0, locations: [{ location_id: "location-1" }] });
    }
    if (url.pathname === "/inventory/v1/items") {
      return Response.json({
        code: 0,
        items: [{ item_id: "item-1", sku: "UPDATED-SKU", locations: [{ location_id: "location-1", location_available_stock: 4 }] }],
        page_context: { has_more_page: false },
      });
    }
    throw new Error(`Unexpected Zoho endpoint: ${url.pathname}`);
  };

  assert.deepEqual(
    await getZohoStockUpdates([{ sku: "OLD-SKU", zoho_product_id: "item-1" }]),
    [{ sku: "OLD-SKU", zoho_product_id: "item-1", stock: 4 }],
  );
});

test("syncs each shoe size from its own Zoho SKU and preserves size mapping", async () => {
  const items = [
    { item_id: "shoe-item-7", sku: "SHOE-UK7-RENAMED", locations: [{ location_id: "location-1", location_available_stock: 3 }] },
    { item_id: "shoe-item-8", sku: "SHOE-UK8", locations: [{ location_id: "location-1", location_available_stock: 6 }] },
    { item_id: "shoe-root-item", sku: "SHOE-AGGREGATE", locations: [{ location_id: "location-1", location_available_stock: 100 }] },
  ];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "accounts.zoho.com") {
      return Response.json({ access_token: "mock-access-token", api_domain: "https://www.zohoapis.com" });
    }
    if (url.pathname === "/inventory/v1/locations") {
      return Response.json({ code: 0, locations: [{ location_id: "location-1" }] });
    }
    if (url.pathname === "/inventory/v1/items") {
      return Response.json({ code: 0, items, page_context: { has_more_page: false } });
    }
    throw new Error(`Unexpected Zoho endpoint: ${url.pathname}`);
  };

  assert.deepEqual(
    await getZohoStockUpdates([{
      id: 42,
      product_type: "shoe",
      sku: "SHOE-AGGREGATE",
      zoho_product_id: "shoe-root-item",
      zoho_size_skus: { "UK 7": "SHOE-UK7", "UK 8": "SHOE-UK8" },
      zoho_size_item_ids: { "UK 7": "shoe-item-7" },
    }]),
    [
      { sku: "SHOE-UK7", zoho_product_id: "shoe-item-7", stock: 3, product_id: 42, size: "UK 7" },
      { sku: "SHOE-UK8", zoho_product_id: "shoe-item-8", stock: 6, product_id: 42, size: "UK 8" },
    ],
  );
});

test("syncs Zoho warehouse inventory by matching configured location names", async () => {
  const items = [
    { item_id: "shoe-item-7", sku: "SHOE-UK7", warehouses: [
      { warehouse_id: "warehouse-madinat", warehouse_name: "MADINAT ZAYED", warehouse_available_stock: 2 },
      { warehouse_id: "warehouse-other", warehouse_name: "OTHER WAREHOUSE", warehouse_available_stock: 9 },
    ] },
    { item_id: "shoe-item-8", sku: "SHOE-UK8", warehouses: [
      { warehouse_id: "warehouse-madinat", warehouse_name: "MADINAT ZAYED", warehouse_available_stock: 1 },
    ] },
    { item_id: "shoe-item-9", sku: "SHOE-UK9", warehouses: [
      { warehouse_id: "warehouse-madinat", warehouse_name: "MADINAT ZAYED", warehouse_available_stock: 1 },
    ] },
  ];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "accounts.zoho.com") {
      return Response.json({ access_token: "mock-access-token", api_domain: "https://www.zohoapis.com" });
    }
    if (url.pathname === "/inventory/v1/locations") {
      return Response.json({ code: 0, locations: [{ location_id: "location-1", location_name: "Madinat Zayed" }] });
    }
    if (url.pathname === "/inventory/v1/items") {
      return Response.json({ code: 0, items, page_context: { has_more_page: false } });
    }
    throw new Error(`Unexpected Zoho endpoint: ${url.pathname}`);
  };

  assert.deepEqual(
    await getZohoStockUpdates([{
      id: 43,
      product_type: "shoe",
      sku: null,
      zoho_size_skus: { "UK 7": "SHOE-UK7", "UK 8": "SHOE-UK8", "UK 9": "SHOE-UK9" },
    }]),
    [
      { sku: "SHOE-UK7", zoho_product_id: "shoe-item-7", stock: 2, product_id: 43, size: "UK 7" },
      { sku: "SHOE-UK8", zoho_product_id: "shoe-item-8", stock: 1, product_id: 43, size: "UK 8" },
      { sku: "SHOE-UK9", zoho_product_id: "shoe-item-9", stock: 1, product_id: 43, size: "UK 9" },
    ],
  );
});

test("fails safely when a configured location has no stock details", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "accounts.zoho.com") {
      return Response.json({ access_token: "mock-access-token", api_domain: "https://www.zohoapis.com" });
    }
    if (url.pathname === "/inventory/v1/locations") {
      return Response.json({ code: 0, locations: [{ location_id: "location-1" }] });
    }
    if (url.pathname === "/inventory/v1/items") {
      return Response.json({
        code: 0,
        items: [{ item_id: "item-1", sku: "SKU-1" }],
        page_context: { has_more_page: false },
      });
    }
    if (url.pathname === "/inventory/v1/items/item-1") {
      return Response.json({ code: 0, item: { item_id: "item-1", sku: "SKU-1", locations: [] } });
    }
    throw new Error(`Unexpected Zoho endpoint: ${url.pathname}`);
  };

  await assert.rejects(getZohoStockUpdates([{ sku: "SKU-1" }]), ZohoInventoryError);
});

test("blocks Zoho-managed stock when mappings or sync timestamps are missing or stale", () => {
  process.env.ZOHO_STOCK_MAX_AGE_SECONDS = "900";
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  assert.equal(isZohoStockFresh("2026-01-01T11:50:00.000Z", 900_000, now), true);
  assert.equal(isZohoStockFresh("2026-01-01T11:40:00.000Z", 900_000, now), false);
  assert.equal(isZohoStockFresh("2026-01-01T12:01:00.000Z", 900_000, now), false);
  assert.equal(getZohoStockStatus({ name: "Racquet", product_type: "racquet", sku: null }, now), "unavailable");
  assert.equal(getZohoStockStatus({
    name: "Racquet",
    product_type: "racquet",
    sku: "R-1",
    zoho_stock_synced_at: "2026-01-01T11:50:00.000Z",
  }, now), "verified");
  assert.equal(isZohoSizeStockFresh({
    product_type: "shoe",
    zoho_size_skus: { "UK 7": "SKU-7", "UK 8": "SKU-8" },
    zoho_size_stock_synced_at: { "UK 7": "2026-01-01T11:50:00.000Z" },
  }, "UK 7", now), true);
  assert.equal(isZohoSizeStockFresh({
    product_type: "shoe",
    zoho_size_skus: { "UK 7": "SKU-7" },
    zoho_size_stock_synced_at: {},
  }, "UK 7", now), false);
  assert.equal(getZohoStockStatus({
    name: "Shoe",
    product_type: "shoe",
    zoho_size_skus: { "UK 7": "SKU-7", "UK 8": "SKU-8" },
    zoho_size_stock_synced_at: { "UK 7": "2026-01-01T11:50:00.000Z" },
  }, now), "verified");
  assert.equal(getZohoStockStatus({ name: "Shoe", product_type: "shoe" }, now), "unavailable");
});
