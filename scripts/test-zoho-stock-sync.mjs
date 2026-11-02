import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const { getZohoStockStatus, isZohoSizeStockSynced, isZohoStockFresh } = await import("../src/lib/zoho-stock-policy.ts");
const stockReconciliationMigration = readFileSync(
  new URL("../SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql", import.meta.url),
  "utf8",
);

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

test("stock reconciliation mirrors Zoho quantities without subtracting paid sales", () => {
  const functionDefinition = stockReconciliationMigration.match(
    /create or replace function public\.sync_zoho_product_stock[\s\S]*?\n\$\$;/i,
  )?.[0];

  assert.ok(functionDefinition, "stock reconciliation function should exist");
  assert.doesNotMatch(functionDefinition, /pending_sales|UNRECORDED_PAID_SALES/i);
  assert.match(functionDefinition, /to_jsonb\(v_external_stock\)/i);
  assert.match(functionDefinition, /set stock = v_external_stock/i);
  assert.equal((functionDefinition.match(/if v_external_stock < v_reserved_stock/gi) ?? []).length, 2);
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
    { item_id: "shoe-item-36", sku: "SHOE-EU36-RENAMED", locations: [{ location_id: "location-1", location_available_stock: 3 }] },
    { item_id: "shoe-item-37", sku: "SHOE-EU37", locations: [{ location_id: "location-1", location_available_stock: 6 }] },
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
      zoho_size_skus: { "EU 36": "SHOE-EU36", "EU 37": "SHOE-EU37" },
      zoho_size_item_ids: { "EU 36": "shoe-item-36" },
    }]),
    [
      { sku: "SHOE-EU36", zoho_product_id: "shoe-item-36", stock: 3, product_id: 42, size: "EU 36" },
      { sku: "SHOE-EU37", zoho_product_id: "shoe-item-37", stock: 6, product_id: 42, size: "EU 37" },
    ],
  );
});

test("syncs all warehouses assigned to configured Zoho locations by warehouse ID", async () => {
  const previousLocationIds = process.env.ZOHO_LOCATION_IDS;
  process.env.ZOHO_LOCATION_IDS = "location-1,location-2,location-3";
  const items = [
    { item_id: "shoe-item-36", sku: "SHOE-EU36", warehouses: [
      { warehouse_id: "warehouse-madinat", warehouse_available_stock: 2 },
      { warehouse_id: "warehouse-office", warehouse_available_stock: 1 },
      { warehouse_id: "warehouse-racket", warehouse_available_stock: 0 },
      { warehouse_id: "warehouse-internal", warehouse_available_stock: 3 },
    ] },
    { item_id: "shoe-item-37", sku: "SHOE-EU37", warehouses: [
      { warehouse_id: "warehouse-madinat", warehouse_available_stock: 1 },
      { warehouse_id: "warehouse-office", warehouse_available_stock: 0 },
      { warehouse_id: "warehouse-racket", warehouse_available_stock: 2 },
      { warehouse_id: "warehouse-internal", warehouse_available_stock: 0 },
    ] },
    { item_id: "shoe-item-38", sku: "SHOE-EU38", warehouses: [
      { warehouse_id: "warehouse-madinat", warehouse_available_stock: 1 },
      { warehouse_id: "warehouse-office", warehouse_available_stock: 2 },
      { warehouse_id: "warehouse-racket", warehouse_available_stock: 0 },
      { warehouse_id: "warehouse-internal", warehouse_available_stock: 1 },
    ] },
  ];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "accounts.zoho.com") {
      return Response.json({ access_token: "mock-access-token", api_domain: "https://www.zohoapis.com" });
    }
    if (url.pathname === "/inventory/v1/locations") {
      return Response.json({
        code: 0,
        locations: [
          { location_id: "location-1", warehouses: [{ warehouse_id: "warehouse-madinat", status: "active" }] },
          { location_id: "location-2", primary_stock_location_id: "warehouse-office", warehouses: [] },
          { location_id: "location-3", warehouses: [
            { warehouse_id: "warehouse-racket", status: "active" },
            { warehouse_id: "warehouse-internal", status: "active" },
          ] },
        ],
      });
    }
    if (url.pathname === "/inventory/v1/items") {
      return Response.json({ code: 0, items, page_context: { has_more_page: false } });
    }
    throw new Error(`Unexpected Zoho endpoint: ${url.pathname}`);
  };

  try {
    assert.deepEqual(
      await getZohoStockUpdates([{
        id: 43,
        product_type: "shoe",
        sku: null,
        zoho_size_skus: { "EU 36": "SHOE-EU36", "EU 37": "SHOE-EU37", "EU 38": "SHOE-EU38" },
      }]),
      [
        { sku: "SHOE-EU36", zoho_product_id: "shoe-item-36", stock: 6, product_id: 43, size: "EU 36" },
        { sku: "SHOE-EU37", zoho_product_id: "shoe-item-37", stock: 3, product_id: 43, size: "EU 37" },
        { sku: "SHOE-EU38", zoho_product_id: "shoe-item-38", stock: 4, product_id: 43, size: "EU 38" },
      ],
    );
  } finally {
    if (previousLocationIds === undefined) delete process.env.ZOHO_LOCATION_IDS;
    else process.env.ZOHO_LOCATION_IDS = previousLocationIds;
  }
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

test("keeps the last successfully synced Zoho stock available until a later sync", () => {
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
    zoho_stock_synced_at: "2026-01-01T11:40:00.000Z",
  }, now), "verified");
  assert.equal(isZohoSizeStockSynced({
    product_type: "shoe",
    zoho_size_skus: { "EU 36": "SKU-36", "EU 37": "SKU-37" },
    zoho_size_stock_synced_at: { "EU 36": "2026-01-01T11:40:00.000Z" },
  }, "EU 36", now), true);
  assert.equal(isZohoSizeStockSynced({
    product_type: "shoe",
    zoho_size_skus: { "EU 36": "SKU-36" },
    zoho_size_stock_synced_at: {},
  }, "EU 36", now), false);
  assert.equal(getZohoStockStatus({
    name: "Shoe",
    product_type: "shoe",
    zoho_size_skus: { "EU 36": "SKU-36", "EU 37": "SKU-37" },
    zoho_size_stock_synced_at: { "EU 36": "2026-01-01T11:40:00.000Z" },
  }, now), "verified");
  assert.equal(getZohoStockStatus({
    name: "T-shirt",
    product_type: "other",
    zoho_size_skus: { S: "TS-S", M: "TS-M" },
    zoho_size_stock_synced_at: { S: "2026-01-01T11:40:00.000Z" },
  }, now), "verified");
  assert.equal(getZohoStockStatus({
    name: "Socks",
    product_type: "other",
    zoho_size_skus: { Small: "SOCK-S" },
    zoho_size_stock_synced_at: {},
  }, now), "unavailable");
  assert.equal(getZohoStockStatus({ name: "Shoe", product_type: "shoe" }, now), "unavailable");
});
