import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";
import { getStripe } from "@/lib/stripe";

type CheckoutOrder = {
  order_id: string;
  total: number;
  items: Array<{ product_name: string; quantity: number; unit_price: number }>;
};

const releaseOrder = async (supabase: NonNullable<ReturnType<typeof createAdminSupabase>>, orderId: string) => {
  const { error } = await supabase.rpc("release_stripe_checkout_order", {
    p_order_id: orderId,
    p_session_id: null,
  });
  if (error) console.error("Unable to release Stripe checkout inventory reservation.", error.message);
};

export async function POST(request: Request) {
  let supabase: ReturnType<typeof createAdminSupabase>;
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) return NextResponse.json({ error: "Sign in to continue to secure checkout." }, { status: 401 });

    supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Order storage is not configured." }, { status: 503 });
    const stripe = getStripe();
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configuredSiteUrl) return NextResponse.json({ error: "Set NEXT_PUBLIC_SITE_URL to the canonical storefront URL." }, { status: 503 });
    const siteUrl = new URL(configuredSiteUrl);
    if (siteUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(siteUrl.hostname)) {
      return NextResponse.json({ error: "NEXT_PUBLIC_SITE_URL must use HTTPS outside local development." }, { status: 500 });
    }
    const body = await request.json() as { products?: unknown; addressId?: unknown; notes?: unknown };

    if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > 30) {
      return NextResponse.json({ error: "Your shopping bag is empty or contains too many items." }, { status: 400 });
    }

    const quantitiesByProduct = new Map<number, number>();
    const itemsByVariant = new Map<string, { product_id: number; quantity: number; color?: string; size?: string }>();
    for (const value of body.products) {
      if (!value || typeof value !== "object") {
        return NextResponse.json({ error: "One or more items in your bag are invalid." }, { status: 400 });
      }
      const item = value as { product?: { id?: unknown }; quantity?: unknown; color?: unknown; size?: unknown };
      const productId = Number(item.product?.id);
      const quantity = Number(item.quantity);
      const color = item.color === undefined ? undefined : typeof item.color === "string" ? item.color.trim() : null;
      const size = item.size === undefined ? undefined : typeof item.size === "string" ? item.size.trim() : null;
      if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 50
        || color === null || size === null || (color !== undefined && (!color || color.length > 40))
        || (size !== undefined && (!size || size.length > 40))) {
        return NextResponse.json({ error: "One or more items in your bag are invalid." }, { status: 400 });
      }
      const combinedQuantity = (quantitiesByProduct.get(productId) ?? 0) + quantity;
      if (combinedQuantity > 50) return NextResponse.json({ error: "The quantity for one product cannot exceed 50." }, { status: 400 });
      quantitiesByProduct.set(productId, combinedQuantity);
      const variantKey = JSON.stringify([productId, color ?? null, size ?? null]);
      const existing = itemsByVariant.get(variantKey);
      itemsByVariant.set(variantKey, {
        product_id: productId,
        quantity: (existing?.quantity ?? 0) + quantity,
        ...(color ? { color } : {}),
        ...(size ? { size } : {}),
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, phone, addresses")
      .eq("firebase_uid", identity.uid)
      .single();
    if (profileError || !profile?.phone) {
      return NextResponse.json({ error: "Complete your phone number and delivery address in your account before checkout." }, { status: 400 });
    }

    const addresses = Array.isArray(profile.addresses)
      ? profile.addresses as Array<{ id: string; city: string; address: string; is_default?: boolean }>
      : [];
    const requestedAddressId = typeof body.addressId === "string" ? body.addressId : null;
    const shippingAddress = requestedAddressId
      ? addresses.find((address) => address.id === requestedAddressId)
      : addresses.find((address) => address.is_default);
    if (!shippingAddress) return NextResponse.json({ error: "Choose or save a delivery address in your account before checkout." }, { status: 400 });

    const { data, error: orderError } = await supabase.rpc("create_stripe_checkout_order", {
      p_user_id: profile.id,
      p_customer_name: profile.full_name || identity.name || identity.email || "Customer",
      p_customer_phone: profile.phone,
      p_city: shippingAddress.city,
      p_address: shippingAddress.address,
      p_notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
      p_variant_schema_version: 2,
      p_items: Array.from(itemsByVariant.values())
        .sort((a, b) => a.product_id - b.product_id || (a.color ?? "").localeCompare(b.color ?? "") || (a.size ?? "").localeCompare(b.size ?? "")),
    });

    if (orderError) {
      if (orderError.code === "42703" || orderError.code === "42883" || orderError.code === "PGRST202") {
        return NextResponse.json({ error: "Checkout database setup is incomplete. Run SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql, then SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql in the Supabase SQL Editor." }, { status: 503 });
      }
      if (orderError.message.includes("INSUFFICIENT_STOCK:")) return NextResponse.json({ error: "A product no longer has enough stock. Update your bag and try again." }, { status: 409 });
      if (orderError.message.includes("INSUFFICIENT_SIZE_STOCK:")) return NextResponse.json({ error: "That shoe size no longer has enough pairs. Update your bag and try again." }, { status: 409 });
      if (orderError.message.includes("PRODUCT_UNAVAILABLE:")) return NextResponse.json({ error: "A product is no longer available. Refresh the store and try again." }, { status: 409 });
      if (orderError.message.includes("INVALID_ORDER_ITEMS")) return NextResponse.json({ error: "One or more items in your bag are invalid." }, { status: 400 });
      if (orderError.message.includes("PRODUCT_VARIANT_REQUIRED")) return NextResponse.json({ error: "Choose a color and size for every item in your bag." }, { status: 400 });
      if (orderError.message.includes("INVALID_PRODUCT_VARIANT")) return NextResponse.json({ error: "A selected color or size is no longer available. Refresh the store and try again." }, { status: 409 });
      console.error("Unable to create Stripe checkout order.", orderError.message);
      return NextResponse.json({ error: "Unable to create your order right now." }, { status: 500 });
    }

    const order = data as CheckoutOrder;
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: order.order_id,
        customer_email: identity.email ?? undefined,
        line_items: order.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "aed",
            unit_amount: Math.round(Number(item.unit_price) * 100),
            product_data: { name: item.product_name },
          },
        })),
        metadata: { order_id: order.order_id },
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        success_url: `${siteUrl.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl.origin}/checkout/cancelled?order_id=${encodeURIComponent(order.order_id)}`,
      });
    } catch (stripeError) {
      await releaseOrder(supabase, order.order_id);
      throw stripeError;
    }

    const { error: sessionLinkError } = await supabase.rpc("set_stripe_checkout_session", {
      p_order_id: order.order_id,
      p_session_id: session.id,
    });
    if (sessionLinkError) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error("Unable to expire an unlinked Stripe Checkout Session.", expireError);
      }
      await releaseOrder(supabase, order.order_id);
      console.error("Unable to link Stripe Checkout Session to the order.", sessionLinkError.message);
      return NextResponse.json({ error: "Unable to start secure checkout. Please try again." }, { status: 500 });
    }

    if (!session.url) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error("Unable to expire a Stripe Checkout Session without a redirect URL.", expireError);
      }
      const { error } = await supabase.rpc("release_stripe_checkout_order", {
        p_order_id: order.order_id,
        p_session_id: session.id,
      });
      if (error) console.error("Unable to release checkout inventory after a missing Stripe URL.", error.message);
      return NextResponse.json({ error: "Stripe did not return a checkout link. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Unable to start Stripe Checkout.", error);
    const minimumAmountError = error instanceof Stripe.errors.StripeError && error.code === "amount_too_small";
    const message = error instanceof Error && error.message.includes("STRIPE_SECRET_KEY")
      ? "Stripe is not configured. Add STRIPE_SECRET_KEY to the server environment."
      : minimumAmountError
        ? "The minimum Stripe card payment for AED is AED 2.00. Increase your bag total and try again."
      : "Unable to start secure checkout right now.";
    return NextResponse.json({ error: message }, { status: minimumAmountError ? 400 : 500 });
  }
}
