import type { createAdminSupabase } from "@/lib/server-auth";

type NotificationChannel = "email" | "whatsapp";
type NotificationStatus = "sent" | "skipped" | "failed";

export type PaidOrderNotification = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  total: number;
  status: string;
  stripe_paid_at: string | null;
  email: string | null;
  whatsapp_order_updates_opt_in: boolean;
  order_items: Array<{ product_name: string; quantity: number; unit_price: number }>;
};

export function isSuccessfulStripePaymentEvent(eventType: string, paymentStatus: string | null) {
  return (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded")
    && paymentStatus === "paid";
}

type NotificationStore = NonNullable<ReturnType<typeof createAdminSupabase>>;
type Fetcher = typeof fetch;
type NotificationEnvironment = Record<string, string | undefined>;

const confirmationMessage = "Your payment has been received successfully. Thank you for your order. Our team will contact you shortly regarding your order.";

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const orderNumber = (id: string) => id.slice(0, 8).toUpperCase();
const amount = (total: number) => new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 2,
}).format(total);

function normalizeWhatsAppPhone(phone: string) {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && digits.length === 9) digits = `971${digits}`;
  else if (!trimmed.startsWith("+") && digits.startsWith("0") && digits.length === 10) digits = `971${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

async function finishNotification(
  supabase: NotificationStore,
  orderId: string,
  channel: NotificationChannel,
  status: NotificationStatus,
  providerId: string | null,
  errorMessage: string | null,
) {
  const { data, error } = await supabase.rpc("finish_order_confirmation_notification", {
    p_order_id: orderId,
    p_channel: channel,
    p_status: status,
    p_provider_id: providerId,
    p_error: errorMessage,
  });
  if (error) throw new Error(`Unable to save ${channel} order notification status: ${error.message}`);
  if (data !== true) throw new Error(`Unable to save ${channel} order notification status.`);
}

async function claimNotification(supabase: NotificationStore, orderId: string, channel: NotificationChannel) {
  const { data, error } = await supabase.rpc("claim_order_confirmation_notification", {
    p_order_id: orderId,
    p_channel: channel,
  });
  if (error) throw new Error(`Unable to claim ${channel} order notification: ${error.message}`);
  return data === true;
}

async function deliverChannel(
  supabase: NotificationStore,
  order: PaidOrderNotification,
  channel: NotificationChannel,
  fetcher: Fetcher,
  env: NotificationEnvironment,
) {
  const customerName = order.customer_name.trim() || "Customer";
  const number = orderNumber(order.id);
  const total = amount(Number(order.total));
  const recipient = order.customer_phone ? normalizeWhatsAppPhone(order.customer_phone) : null;
  const customerEmail = order.email?.trim();

  if (channel === "email") {
    if (!customerEmail) {
      if (!await claimNotification(supabase, order.id, channel)) return;
      console.warn(`Skipping order confirmation email for ${order.id}: the customer has no email address.`);
      await finishNotification(supabase, order.id, channel, "skipped", null, "Customer email is missing.");
      return;
    }
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM?.trim()) {
      console.warn(`Leaving order confirmation email pending for ${order.id}: Resend is not fully configured.`);
      return;
    }
  } else {
    if (!order.whatsapp_order_updates_opt_in) {
      if (!await claimNotification(supabase, order.id, channel)) return;
      await finishNotification(supabase, order.id, channel, "skipped", null, "Customer has not opted in to WhatsApp order updates.");
      return;
    }
    if (!recipient) {
      if (!await claimNotification(supabase, order.id, channel)) return;
      await finishNotification(supabase, order.id, channel, "skipped", null, "Customer phone number is missing or invalid.");
      return;
    }
    const config = [
      env.WHATSAPP_ACCESS_TOKEN,
      env.WHATSAPP_PHONE_NUMBER_ID,
      env.WHATSAPP_TEMPLATE_NAME,
      env.WHATSAPP_GRAPH_API_VERSION,
    ];
    if (config.every((value) => !value?.trim())) {
      console.warn(`Leaving WhatsApp order confirmation pending for ${order.id}: WhatsApp Cloud API is not configured.`);
      return;
    }
  }

  if (!await claimNotification(supabase, order.id, channel)) return;

  try {
    if (channel === "email") {
      const escapedName = escapeHtml(customerName);
      const escapedNumber = escapeHtml(number);
      const escapedTotal = escapeHtml(total);
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `order-confirmation-${order.id}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [customerEmail],
          subject: `Order #${number} confirmed`,
          text: `Hello ${customerName},\n\nOrder #${number}\nPayment status: Paid\nOrder amount: ${total}\n\n${confirmationMessage}`,
          html: `<p>Hello ${escapedName},</p><p>${escapeHtml(confirmationMessage)}</p><dl><dt>Order number</dt><dd>#${escapedNumber}</dd><dt>Payment status</dt><dd>Paid</dd><dt>Order amount</dt><dd>${escapedTotal}</dd></dl>`,
        }),
      });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok) throw new Error(result.message || `Resend returned HTTP ${response.status}.`);
      await finishNotification(supabase, order.id, channel, "sent", result.id ?? null, null);
      return;
    }

    if (!recipient) throw new Error("Customer phone number is missing or invalid.");
    const accessToken = env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = env.WHATSAPP_TEMPLATE_NAME;
    const graphVersion = env.WHATSAPP_GRAPH_API_VERSION;
    if (!accessToken || !phoneNumberId || !templateName || !graphVersion) {
      throw new Error("Set all WhatsApp Cloud API configuration variables before enabling WhatsApp notifications.");
    }

    const response = await fetcher(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: customerName },
              { type: "text", text: number },
              { type: "text", text: total },
              { type: "text", text: confirmationMessage },
            ],
          }],
        },
      }),
    });
    const result = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message || `WhatsApp Cloud API returned HTTP ${response.status}.`);
    await finishNotification(supabase, order.id, channel, "sent", result.messages?.[0]?.id ?? null, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification delivery failed.";
    await finishNotification(supabase, order.id, channel, "failed", null, message);
    throw new Error(`Unable to deliver ${channel} order confirmation for order ${order.id}: ${message}`);
  }
}

export async function sendPaidOrderNotifications(
  supabase: NotificationStore,
  order: PaidOrderNotification,
  options: { fetcher?: Fetcher; env?: NotificationEnvironment } = {},
) {
  if (order.status !== "paid" || !order.stripe_paid_at) {
    throw new Error("Order notifications can only be sent for orders confirmed paid by Stripe.");
  }

  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  await deliverChannel(supabase, order, "email", fetcher, env);
  await deliverChannel(supabase, order, "whatsapp", fetcher, env);
}

export { normalizeWhatsAppPhone };
