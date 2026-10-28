import assert from "node:assert/strict";
import test from "node:test";

const { isSuccessfulStripePaymentEvent, sendPaidOrderNotifications } = await import("../src/lib/order-notifications.ts");

const paidOrder = {
  id: "f70af4bc-9fd2-4edb-8d0a-24d54a9f53ab",
  customer_name: "Test Customer",
  customer_phone: "+971501234567",
  total: 125.5,
  status: "paid",
  stripe_paid_at: "2026-10-22T12:00:00.000Z",
  email: "customer@example.com",
  whatsapp_order_updates_opt_in: true,
  order_items: [{ product_name: "Test racquet", quantity: 1, unit_price: 125.5 }],
};

const configuredEnv = {
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM: "Al Raed Sports <orders@example.com>",
  WHATSAPP_ACCESS_TOKEN: "test-whatsapp-token",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_TEMPLATE_NAME: "order_confirmation",
  WHATSAPP_TEMPLATE_LANGUAGE: "en",
  WHATSAPP_GRAPH_API_VERSION: "v26.0",
};

function createStore(order = paidOrder) {
  const status = { email: "pending", whatsapp: "pending" };
  const store = {
    status,
    async rpc(name, args) {
      const channel = args.p_channel;
      if (name === "claim_order_confirmation_notification") {
        if (order.status !== "paid" || !order.stripe_paid_at) return { data: false, error: null };
        if (status[channel] === "sent" || status[channel] === "skipped" || status[channel] === "sending") {
          return { data: false, error: null };
        }
        status[channel] = "sending";
        return { data: true, error: null };
      }
      if (name === "finish_order_confirmation_notification") {
        if (status[channel] !== "sending") return { data: false, error: null };
        status[channel] = args.p_status;
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  return store;
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("only Stripe paid completion events qualify for customer notifications", () => {
  assert.equal(isSuccessfulStripePaymentEvent("checkout.session.completed", "paid"), true);
  assert.equal(isSuccessfulStripePaymentEvent("checkout.session.async_payment_succeeded", "paid"), true);
  assert.equal(isSuccessfulStripePaymentEvent("checkout.session.completed", "unpaid"), false);
  assert.equal(isSuccessfulStripePaymentEvent("checkout.session.async_payment_failed", "unpaid"), false);
  assert.equal(isSuccessfulStripePaymentEvent("checkout.session.expired", "unpaid"), false);
  assert.equal(isSuccessfulStripePaymentEvent("checkout.session.completed", "no_payment_required"), false);
});

test("confirmed payment sends one email and one opted-in WhatsApp template", async () => {
  const store = createStore();
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    return url.includes("resend.com")
      ? response({ id: "email-provider-id" })
      : response({ messages: [{ id: "whatsapp-provider-id" }] });
  };

  await sendPaidOrderNotifications(store, paidOrder, { fetcher, env: configuredEnv });

  assert.deepEqual(store.status, { email: "sent", whatsapp: "sent" });
  assert.equal(requests.length, 2);
  const emailRequest = requests.find(({ url }) => url.includes("resend.com"));
  const email = JSON.parse(emailRequest.init.body);
  assert.deepEqual(email.to, ["customer@example.com"]);
  assert.equal(emailRequest.init.headers.Authorization, `Bearer ${configuredEnv.RESEND_API_KEY}`);
  assert.match(email.text, /Payment status: Paid/);
  assert.match(email.text, /AED\s?125\.5/);
  assert.match(emailRequest.init.headers["Idempotency-Key"], /f70af4bc-9fd2-4edb-8d0a-24d54a9f53ab/);
  const whatsappRequest = requests.find(({ url }) => url.includes("graph.facebook.com"));
  const whatsapp = JSON.parse(whatsappRequest.init.body);
  assert.equal(whatsappRequest.init.headers.Authorization, `Bearer ${configuredEnv.WHATSAPP_ACCESS_TOKEN}`);
  assert.equal(whatsapp.to, "971501234567");
  assert.equal(whatsapp.template.name, "order_confirmation");
  assert.equal(whatsapp.template.components[0].parameters.length, 4);
});

test("failed, cancelled, and pending orders never trigger notifications", async () => {
  for (const status of ["failed", "cancelled", "awaiting_payment"]) {
    const order = { ...paidOrder, status, stripe_paid_at: null };
    const store = createStore(order);
    let requestCount = 0;
    await assert.rejects(sendPaidOrderNotifications(store, order, {
      env: configuredEnv,
      fetcher: async () => { requestCount += 1; return response({}); },
    }), /can only be sent for orders confirmed paid by Stripe/);
    assert.equal(requestCount, 0);
    assert.deepEqual(store.status, { email: "pending", whatsapp: "pending" });
  }
});

test("replayed webhook does not send duplicate notifications", async () => {
  const store = createStore();
  let requestCount = 0;
  const fetcher = async (url) => {
    requestCount += 1;
    return url.includes("resend.com") ? response({ id: "email-provider-id" }) : response({ messages: [{ id: "wa-id" }] });
  };

  await sendPaidOrderNotifications(store, paidOrder, { fetcher, env: configuredEnv });
  await sendPaidOrderNotifications(store, paidOrder, { fetcher, env: configuredEnv });

  assert.equal(requestCount, 2);
  assert.deepEqual(store.status, { email: "sent", whatsapp: "sent" });
});

test("missing customer email is recorded as skipped without blocking payment confirmation", async () => {
  const order = { ...paidOrder, email: null, whatsapp_order_updates_opt_in: false };
  const store = createStore(order);
  let requestCount = 0;

  await sendPaidOrderNotifications(store, order, {
    env: configuredEnv,
    fetcher: async () => { requestCount += 1; return response({}); },
  });

  assert.equal(requestCount, 0);
  assert.deepEqual(store.status, { email: "skipped", whatsapp: "skipped" });
});

test("WhatsApp stays disabled without explicit customer consent", async () => {
  const order = { ...paidOrder, whatsapp_order_updates_opt_in: false };
  const store = createStore(order);
  const requests = [];

  await sendPaidOrderNotifications(store, order, {
    env: configuredEnv,
    fetcher: async (url) => {
      requests.push(url);
      return url.includes("resend.com") ? response({ id: "email-id" }) : response({ messages: [{ id: "wa-id" }] });
    },
  });

  assert.deepEqual(requests, ["https://api.resend.com/emails"]);
  assert.equal(store.status.whatsapp, "skipped");
});

test("unconfigured providers stay pending and can deliver after configuration", async () => {
  const store = createStore();
  let requestCount = 0;
  const fetcher = async (url) => {
    requestCount += 1;
    return url.includes("resend.com") ? response({ id: "email-id" }) : response({ messages: [{ id: "wa-id" }] });
  };

  await sendPaidOrderNotifications(store, paidOrder, { fetcher, env: {} });

  assert.deepEqual(store.status, { email: "pending", whatsapp: "pending" });
  assert.equal(requestCount, 0);

  await sendPaidOrderNotifications(store, paidOrder, { fetcher, env: configuredEnv });

  assert.deepEqual(store.status, { email: "sent", whatsapp: "sent" });
  assert.equal(requestCount, 2);
});

test("provider failure is marked failed so a Stripe webhook retry can try again", async () => {
  const store = createStore();

  await assert.rejects(sendPaidOrderNotifications(store, paidOrder, {
    env: { ...configuredEnv, WHATSAPP_ACCESS_TOKEN: undefined, WHATSAPP_PHONE_NUMBER_ID: undefined, WHATSAPP_TEMPLATE_NAME: undefined, WHATSAPP_GRAPH_API_VERSION: undefined },
    fetcher: async (url) => url.includes("resend.com") ? response({ message: "temporary failure" }, 503) : response({}),
  }), /temporary failure/);

  assert.equal(store.status.email, "failed");
  assert.equal(store.status.whatsapp, "pending");
});
