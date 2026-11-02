type WhatsAppOrderItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
};

type WhatsAppOrderConfirmation = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  city: string | null;
  address: string | null;
  total: number;
  order_items?: WhatsAppOrderItem[];
};

export const ALRAED_WHATSAPP_CONTACT = "+971 50 484 8236";

export function normalizeWhatsAppPhone(phone: string) {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("9710") && digits.length === 13) digits = `971${digits.slice(4)}`;
  else if (digits.startsWith("0") && digits.length === 10) digits = `971${digits.slice(1)}`;
  else if (!digits.startsWith("971") && digits.length === 9 && !digits.startsWith("0")) digits = `971${digits}`;

  return /^\d{8,15}$/.test(digits) ? digits : null;
}

const formatAED = (value: number) => `AED ${value.toLocaleString("en-AE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const cleanSingleLine = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();

export function createWhatsAppOrderConfirmationLink(order: WhatsAppOrderConfirmation) {
  const recipient = order.customer_phone ? normalizeWhatsAppPhone(order.customer_phone) : null;
  const total = Number(order.total);
  const items = order.order_items ?? [];

  if (!recipient || !Number.isFinite(total) || total < 0 || items.length === 0) return null;
  if (items.some((item) => !item.product_name.trim() || !Number.isFinite(Number(item.quantity)) || item.quantity < 1
    || !Number.isFinite(Number(item.unit_price)) || item.unit_price < 0)) return null;

  const itemLines = items.map((item) => {
    const name = cleanSingleLine(item.product_name);
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    return `• ${name} — ${quantity} × ${formatAED(unitPrice)} = ${formatAED(quantity * unitPrice)}`;
  });
  const location = [order.address, order.city]
    .map((part) => part?.replace(/[\r\n\t]+/g, " ").trim())
    .filter((part): part is string => Boolean(part))
    .join(", ") || "No delivery location was saved on this order.";
  const customerName = cleanSingleLine(order.customer_name) || "there";
  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const message = [
    `Hello ${customerName},`,
    "",
    "Thank you for your order with Al Raed Sports.",
    "",
    "*Payment confirmed*",
    `Order: #${orderNumber}`,
    `Total amount paid: ${formatAED(total)}`,
    "",
    "*Order items*",
    ...itemLines,
    "",
    "*Delivery location selected*",
    location,
    "",
    "Please confirm that this delivery location is correct. We’ll coordinate delivery and answer any questions here.",
    "",
    `Al Raed Sports · ${ALRAED_WHATSAPP_CONTACT}`,
  ].join("\n");

  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}
