import assert from "node:assert/strict";
import test from "node:test";

const { shoeSizesByCategory } = await import("../src/lib/shoe-sizes.ts");

test("junior shoe sizes use EU 32 through 41", () => {
  assert.deepEqual(shoeSizesByCategory.junior, Array.from({ length: 10 }, (_, index) => `EU ${index + 32}`));
});

test("women's shoe sizes use EU 35 through 45", () => {
  assert.deepEqual(shoeSizesByCategory.womens, Array.from({ length: 11 }, (_, index) => `EU ${index + 35}`));
});

test("men's and unisex shoe sizes use EU 36 through 46", () => {
  assert.deepEqual(shoeSizesByCategory.mens, Array.from({ length: 11 }, (_, index) => `EU ${index + 36}`));
});
