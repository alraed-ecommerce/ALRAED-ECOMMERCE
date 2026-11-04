import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";

const ensureAdmin = async (request: Request) => {
  const identity = await getFirebaseIdentity(request);
  if (!identity) {
    throw new Error("Unauthorized");
  }
  if (!isAdminEmail(identity.email)) {
    throw new Error("Access denied");
  }
  return identity;
};

export async function GET(request: Request) {
  try {
    await ensureAdmin(request);
    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Order storage is not configured." }, { status: 500 });

    if (new URL(request.url).searchParams.get("view") === "fulfillment-notifications") {
      const { data: paidOrders, error: notificationError } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "paid");

      if (notificationError) {
        console.error("Unable to load paid-order notification counts.", notificationError.message);
        return NextResponse.json({ error: "Unable to load paid-order notifications." }, { status: 500 });
      }

      return NextResponse.json({ paidOrderIds: (paidOrders ?? []).map((order) => order.id) });
    }

    if (new URL(request.url).searchParams.get("view") === "fulfillment") {
      const { data: fulfillmentOrders, error: fulfillmentError } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, city, address, total, status, created_at, stripe_payment_intent_id, stripe_payment_method, stripe_paid_at, order_items(id, product_name, quantity, unit_price)")
        .in("status", ["paid", "processing", "shipped", "delivered"])
        .order("created_at", { ascending: true });

      if (fulfillmentError) {
        console.error("Unable to load fulfillment orders.", fulfillmentError.message);
        if (fulfillmentError.code === "42703") {
          return NextResponse.json({ error: "Run SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql to enable order payment details." }, { status: 503 });
        }
        return NextResponse.json({ error: "Unable to load fulfillment orders." }, { status: 500 });
      }

      return NextResponse.json({ orders: fulfillmentOrders ?? [] });
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, user_id, customer_name, customer_phone, city, address, total, status, notes, created_at, stripe_payment_intent_id, stripe_payment_method, stripe_paid_at, zoho_invoice_recorded_at, order_items(id, product_id, product_name, quantity, unit_price)")
      .order("created_at", { ascending: false });

    if (error?.code === "42703") {
      return NextResponse.json({ error: "Run SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql and SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql in Supabase to enable order and stock details." }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const orderIds = (orders ?? []).map((order) => order.id);
    type StatusHistoryRecord = {
      id: number;
      order_id: string;
      previous_status: string;
      new_status: string;
      changed_at: string;
      changed_by_uid: string | null;
      changed_by_email: string | null;
    };
    let statusHistory: StatusHistoryRecord[] = [];
    if (orderIds.length) {
      const { data: historyRows, error: historyError } = await supabase
        .from("order_status_history")
        .select("id, order_id, previous_status, new_status, changed_at, changed_by_uid, changed_by_email")
        .in("order_id", orderIds)
        .order("changed_at", { ascending: false });
      if (historyError) {
        console.error("Unable to load order status history.", historyError.message);
        if (historyError.code === "42P01" || historyError.code === "PGRST205") {
          return NextResponse.json({ error: "Run SUPABASE_ORDER_STATUS_AUDIT_MIGRATION.sql in Supabase to enable order status history and operational alerts." }, { status: 503 });
        }
        return NextResponse.json({ error: "Unable to load order status history." }, { status: 500 });
      }
      statusHistory = historyRows ?? [];
    }

    const userIds = [...new Set((orders ?? []).map((order) => order.user_id).filter((id): id is string => Boolean(id)))];
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from("profiles").select("id, whatsapp_order_updates_opt_in").in("id", userIds)
      : { data: [], error: null };
    if (profilesError) {
      console.error("Unable to load WhatsApp consent for admin orders.", profilesError.message);
      if (profilesError.code === "42703") {
        return NextResponse.json({ error: "Run SUPABASE_ORDER_NOTIFICATION_MIGRATION.sql to enable WhatsApp consent checks." }, { status: 503 });
      }
      return NextResponse.json({ error: "Unable to load customer WhatsApp preferences for orders." }, { status: 500 });
    }

    const whatsappConsentByUserId = new Map((profiles ?? []).map((profile) => [profile.id, profile.whatsapp_order_updates_opt_in === true]));
    const historyByOrderId = new Map<string, StatusHistoryRecord[]>();
    for (const entry of statusHistory) {
      const entries = historyByOrderId.get(entry.order_id) ?? [];
      entries.push(entry);
      historyByOrderId.set(entry.order_id, entries);
    }
    return NextResponse.json({
      orders: (orders ?? []).map(({ user_id, ...order }) => ({
        ...order,
        whatsapp_order_updates_opt_in: user_id ? whatsappConsentByUserId.get(user_id) === true : false,
        status_history: historyByOrderId.get(order.id) ?? [],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Access denied" ? 403 : 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await ensureAdmin(request);
    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Order storage is not configured." }, { status: 500 });

    const body = await request.json() as { id?: string; status?: string; notes?: string | null; recordZohoInvoice?: boolean };
    if (!body.id) return NextResponse.json({ error: "Order id is required." }, { status: 400 });

    if (body.recordZohoInvoice === true) {
      const { data: currentOrder, error: currentOrderError } = await supabase
        .from("orders")
        .select("status, zoho_invoice_recorded_at")
        .eq("id", body.id)
        .single();
      if (currentOrderError) {
        if (currentOrderError.code === "42703") {
          return NextResponse.json({ error: "Run SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql in Supabase first." }, { status: 503 });
        }
        return NextResponse.json({ error: "Unable to verify the order before recording its Zoho invoice." }, { status: 500 });
      }
      if (currentOrder.zoho_invoice_recorded_at) {
        return NextResponse.json({ order: { id: body.id, zoho_invoice_recorded_at: currentOrder.zoho_invoice_recorded_at } });
      }
      if (!["paid", "processing", "shipped", "delivered"].includes(currentOrder.status)) {
        return NextResponse.json({ error: "Only paid orders can be recorded as invoiced in Zoho." }, { status: 409 });
      }
      const { data: updatedOrder, error: updateError } = await supabase
        .from("orders")
        .update({ zoho_invoice_recorded_at: new Date().toISOString() })
        .eq("id", body.id)
        .is("zoho_invoice_recorded_at", null)
        .in("status", ["paid", "processing", "shipped", "delivered"])
        .select("id, zoho_invoice_recorded_at")
        .single();
      if (updateError) {
        console.error("Unable to record the manually created Zoho invoice.", updateError.message);
        return NextResponse.json({ error: "Unable to record the Zoho invoice. Refresh the orders list and try again." }, { status: 500 });
      }
      return NextResponse.json({ order: updatedOrder });
    }

    const allowedStatuses = ["awaiting_payment", "paid", "processing", "shipped", "delivered", "cancelled"];
    if (body.status && !allowedStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid order status." }, { status: 400 });
    }

    if (body.status) {
      const { error: transitionError } = await supabase.rpc("admin_update_order_status", {
        p_order_id: body.id,
        p_status: body.status,
        p_notes: typeof body.notes === "string" ? body.notes : null,
        p_update_notes: typeof body.notes === "string",
        p_actor_uid: identity.uid,
        p_actor_email: identity.email,
      });

      if (transitionError) {
        const message = transitionError.message;
        if (message.includes("ORDER_NOT_FOUND")) return NextResponse.json({ error: "Order not found." }, { status: 404 });
        if (message.includes("INSUFFICIENT_STOCK:")) return NextResponse.json({ error: "Not enough stock to mark this order as paid. Check inventory and contact the customer before accepting payment." }, { status: 409 });
        if (message.includes("ORDER_ITEM_MISSING_PRODUCT_ID")) return NextResponse.json({ error: "This older order has no product links for automatic stock deduction. Reconcile its inventory manually before marking it paid." }, { status: 409 });
        if (message.includes("ORDER_HAS_NO_ITEMS")) return NextResponse.json({ error: "This order has no items to process." }, { status: 409 });
        if (message.includes("INVALID_ORDER_STATUS")) return NextResponse.json({ error: "Only unpaid orders can be marked as paid." }, { status: 409 });
        if (message.includes("STRIPE_STOCK_RESERVED")) return NextResponse.json({ error: "This Stripe checkout is still awaiting payment. Wait for Stripe's signed webhook before changing its status." }, { status: 409 });
        if (message.includes("STRIPE_PAYMENT_CONFIRMED")) return NextResponse.json({ error: "A confirmed Stripe payment cannot be reopened or cancelled without first processing a refund." }, { status: 409 });
        if (message.includes("STRIPE_CHECKOUT_CANCELLED")) return NextResponse.json({ error: "A cancelled Stripe checkout cannot be reopened. Ask the customer to start a new checkout." }, { status: 409 });
        if (message.includes("STRIPE_PAYMENT_REQUIRES_WEBHOOK")) return NextResponse.json({ error: "Stripe payments are confirmed by the signed payment webhook; do not mark this checkout manually." }, { status: 409 });
        if (transitionError.code === "PGRST202") {
          return NextResponse.json({ error: "Run SUPABASE_ORDER_STATUS_AUDIT_MIGRATION.sql in Supabase before changing order statuses." }, { status: 503 });
        }
        console.error("Unable to safely update order status.", transitionError.message);
        return NextResponse.json({ error: "Unable to safely process payment and inventory. No changes were applied." }, { status: 500 });
      }
    }

    const orderSelection = "id, customer_name, customer_phone, city, address, total, status, notes, created_at, stripe_payment_intent_id, stripe_payment_method, stripe_paid_at, zoho_invoice_recorded_at, order_items(id, product_id, product_name, quantity, unit_price)";
    const orderQuery = body.status
      ? supabase.from("orders").select(orderSelection).eq("id", body.id)
      : supabase.from("orders").update({
        notes: typeof body.notes === "string" ? body.notes : undefined,
      }).eq("id", body.id).select(orderSelection);
    const { data: order, error } = await orderQuery.single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Access denied" ? 403 : 401 });
  }
}
