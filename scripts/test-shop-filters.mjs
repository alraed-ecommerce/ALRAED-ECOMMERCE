import assert from "node:assert/strict";
import test from "node:test";

const { getBrandOptions, normalizeBrand } = await import("../src/lib/store-products.ts");

const products = [
  { brand: "YONEX", category: "Badminton" },
  { brand: "Yonex", category: "Tennis" },
  { brand: " yonex ", category: "Tennis" },
  { brand: "WILSON", category: "Tennis" },
  { brand: "", category: "Accessories" },
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
