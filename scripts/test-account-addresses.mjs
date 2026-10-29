import assert from "node:assert/strict";
import test from "node:test";

const { normalizeDefaultAddresses } = await import("../src/lib/account-addresses.ts");

const addresses = [
  { id: "home", is_default: true },
  { id: "work", is_default: false },
];

test("selecting a later address makes it the only default", () => {
  const selected = addresses.map((address) => ({ ...address, is_default: address.id === "work" }));

  assert.deepEqual(normalizeDefaultAddresses(selected), [
    { id: "home", is_default: false },
    { id: "work", is_default: true },
  ]);
});

test("multiple requested defaults are normalized to the first selected address", () => {
  assert.deepEqual(normalizeDefaultAddresses([
    { id: "home", is_default: true },
    { id: "work", is_default: true },
  ]), [
    { id: "home", is_default: true },
    { id: "work", is_default: false },
  ]);
});

test("an address list without a default falls back to the first address", () => {
  assert.deepEqual(normalizeDefaultAddresses([
    { id: "home", is_default: false },
    { id: "work", is_default: false },
  ]), [
    { id: "home", is_default: true },
    { id: "work", is_default: false },
  ]);
});
