import assert from "node:assert/strict";
import test from "node:test";

const { getBrandOptions, mapStoreProduct, normalizeBrand } = await import("../src/lib/store-products.ts");

const products = [
  { brand: "YONEX", category: "Badminton", stock: 5, stockStatus: "manual" },
  { brand: "Yonex", category: "Tennis", stock: 3, stockStatus: "manual" },
  { brand: " yonex ", category: "Tennis", stock: 2, stockStatus: "manual" },
  { brand: "WILSON", category: "Tennis", stock: 1, stockStatus: "manual" },
  { brand: "", category: "Accessories", stock: 4, stockStatus: "manual" },
  { brand: "Yonex", category: "Tennis", stock: 0, stockStatus: "manual" },
  { brand: "Wilson", category: "Tennis", stock: 8, stockStatus: "unavailable" },
];

test("brand normalization merges casing and surrounding whitespace", () => {
  assert.equal(normalizeBrand(" Yonex "), "yonex");
  assert.equal(normalizeBrand("YONEX"), "yonex");
  assert.equal(normalizeBrand("  "), "al raed sports");
});

test("brand options combine duplicate casing and count products in the selected category", () => {
  const allBrands = getBrandOptions(products, "All");
  assert.deepEqual(allBrands, [
    ["al raed sports", "AL RAED SPORTS", 1],
    ["wilson", "WILSON", 1],
    ["yonex", "Yonex", 3],
  ]);
  assert.deepEqual(getBrandOptions(products, "Tennis"), [
    ["wilson", "WILSON", 1],
    ["yonex", "Yonex", 2],
  ]);
});

test("brand option counts exclude out-of-stock and unavailable products", () => {
  assert.deepEqual(getBrandOptions(products, "Tennis"), [
    ["wilson", "WILSON", 1],
    ["yonex", "Yonex", 2],
  ]);
});

test("store product mapping preserves customer-facing description and specifications", () => {
  const product = mapStoreProduct({
    id: 8,
    name: "Court racquet",
    category: "Badminton",
    description: "A lightweight racquet.",
    specifications: { Weight: "4U", Material: "Graphite" },
  });

  assert.equal(product.description, "A lightweight racquet.");
  assert.deepEqual(product.specifications, { Weight: "4U", Material: "Graphite" });
});

test("store product mapping keeps ordered gallery images with the primary image first", () => {
  const product = mapStoreProduct({
    id: 10,
    name: "Gallery racquet",
    category: "Badminton",
    image_url: "https://example.com/front.jpg",
    image_urls: ["https://example.com/front.jpg", "https://example.com/side.jpg", "https://example.com/front.jpg"],
  });

  assert.equal(product.image, "https://example.com/front.jpg");
  assert.deepEqual(product.images, ["https://example.com/front.jpg", "https://example.com/side.jpg"]);
});

test("store product mapping retains EU shoe sizes and synced per-size stock", () => {
  const product = mapStoreProduct({
    id: 9,
    name: "Junior court shoe",
    category: "Badminton",
    product_type: "shoe",
    size_category: "junior",
    sizes: ["EU 32", "EU 33"],
    size_stock: { "EU 32": 2, "EU 33": 0 },
    unavailable_sizes: ["EU 33"],
  });

  assert.equal(product.sizeCategory, "junior");
  assert.deepEqual(product.sizes, ["EU 32", "EU 33"]);
  assert.deepEqual(product.sizeStock, { "EU 32": 2, "EU 33": 0 });
  assert.equal(product.stock, 2);
});
