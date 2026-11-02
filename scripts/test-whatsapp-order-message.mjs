import assert from "node:assert/strict";
import test from "node:test";

const { createWhatsAppOrderConfirmationLink, normalizeWhatsAppPhone } = await import("../src/lib/whatsapp.ts");

const order = {
  id: "f70af4bc-9fd2-4edb-8d0a-24d54a9f53ab",
  customer_name: "Test Customer",
  customer_phone: "0501234567",
  city: "Dubai",
  address: "Apartment 12, Example Tower",
  total: 145.5,
  order_items: [
    { product_name: "Test racquet", quantity: 2, unit_price: 60 },
    { product_name: "Grip", quantity: 1, unit_price: 25.5 },
  ],
};

test("normalizes UAE customer phone formats for WhatsApp click-to-chat", () => {
  assert.equal(normalizeWhatsAppPhone("0501234567"), "971501234567");
  assert.equal(normalizeWhatsAppPhone("501234567"), "971501234567");
  assert.equal(normalizeWhatsAppPhone("+971 50 123 4567"), "971501234567");
  assert.equal(normalizeWhatsAppPhone("+971 050 123 4567"), "971501234567");
  assert.equal(normalizeWhatsAppPhone("123"), null);
});

test("creates a prefilled paid-order message with item prices and delivery location", () => {
  const link = createWhatsAppOrderConfirmationLink(order);
  assert.ok(link);
  assert.match(link, /^https:\/\/wa\.me\/971501234567\?text=/);

  const message = new URL(link).searchParams.get("text");
  assert.match(message, /Payment confirmed/);
  assert.match(message, /Total amount paid: AED 145\.50/);
  assert.match(message, /Test racquet — 2 × AED 60\.00 = AED 120\.00/);
  assert.match(message, /Grip — 1 × AED 25\.50 = AED 25\.50/);
  assert.match(message, /Apartment 12, Example Tower, Dubai/);
  assert.match(message, /Please confirm that this delivery location is correct/);
  assert.match(message, /\+971 50 484 8236/);
});

test("does not create a chat link when customer contact or item details are invalid", () => {
  assert.equal(createWhatsAppOrderConfirmationLink({ ...order, customer_phone: "123" }), null);
  assert.equal(createWhatsAppOrderConfirmationLink({ ...order, order_items: [] }), null);
  assert.equal(createWhatsAppOrderConfirmationLink({ ...order, total: Number.NaN }), null);
});
