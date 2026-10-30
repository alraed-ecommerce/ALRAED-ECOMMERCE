import { NextResponse } from "next/server";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";
import { parseCheckoutCart } from "@/lib/checkout-cart";
import { calculateCheckoutTotals, toFils, validateCouponEligibility, type CouponForValidation } from "@/lib/checkout-pricing";
import { getZohoStockStatus, isZohoSizeStockFresh, isZohoStockSyncEnabled } from "@/lib/zoho-stock-policy";

type ProductRow = {
  id: number;
  name: string;
  price: number | string;
  image_url: string | null;
  product_type: string | null;
  colors: string[] | null;
  sizes: string[] | null;
  unavailable_sizes: string[] | null;
  size_stock: Record<string, number> | null;
};

export async function POST(request: Request) {
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) return NextResponse.json({ error: "Sign in to review your order." }, { status: 401 });

    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Order storage is not configured." }, { status: 503 });

    let body: { products?: unknown; couponCode?: unknown };
    try {
      body = await request.json() as { products?: unknown; couponCode?: unknown };
    } catch {
      return NextResponse.json({ error: "Your shopping bag could not be read." }, { status: 400 });
    }
    const parsedCart = parseCheckoutCart(body.products);
    if (!parsedCart.items) return NextResponse.json({ error: parsedCart.error }, { status: 400 });

    const ids = [...new Set(parsedCart.items.map((item) => item.productId))];
    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, image_url, product_type, colors, sizes, unavailable_sizes, size_stock")
      .in("id", ids)
      .eq("is_active", true);
    if (productsError) {
      if (productsError.code === "42703" || productsError.code === "PGRST204") {
        return NextResponse.json({ error: "Run SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql before using checkout." }, { status: 503 });
      }
      console.error("Unable to load checkout quote products.", productsError.message);
      return NextResponse.json({ error: "Unable to verify your products right now." }, { status: 500 });
    }

    const productsById = new Map((productRows ?? []).map((product) => [Number(product.id), product as ProductRow]));
    let zohoProductsById = new Map<number, {
      product_type: string | null;
      name: string;
      sku: string | null;
      zoho_product_id: string | null;
      zoho_stock_synced_at: string | null;
      zoho_size_skus: Record<string, string> | null;
      zoho_size_stock_synced_at: Record<string, string> | null;
    }>();
    if (isZohoStockSyncEnabled()) {
      const { data: stockMappings, error: stockMappingsError } = await supabase
        .from("products")
        .select("id, product_type, name, sku, zoho_product_id, zoho_stock_synced_at, zoho_size_skus, zoho_size_stock_synced_at")
        .in("id", ids)
        .eq("is_active", true);
      if (stockMappingsError) {
        console.error("Unable to verify Zoho stock freshness for checkout quote.", stockMappingsError.message);
        if (stockMappingsError.code === "42703" || stockMappingsError.code === "PGRST204") {
          return NextResponse.json({ error: "Run SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql before using Zoho-managed stock." }, { status: 503 });
        }
        return NextResponse.json({ error: "Unable to verify current stock. Please try again shortly." }, { status: 503 });
      }
      zohoProductsById = new Map((stockMappings ?? []).map((product) => [Number(product.id), product]));
    }

    const items = [];
    let subtotalFils = 0;
    for (const cartItem of parsedCart.items) {
      const product = productsById.get(cartItem.productId);
      if (!product) {
        return NextResponse.json({ error: "A product in your bag is no longer available. Refresh your bag and try again." }, { status: 409 });
      }
      const colors = product.colors ?? [];
      const sizes = product.sizes ?? [];
      const isShoe = product.product_type === "shoe" || /shoe|sneaker/i.test(product.name);
      const zohoStockProduct = zohoProductsById.get(cartItem.productId);
      if (isZohoStockSyncEnabled() && (isShoe
        ? !cartItem.size || !zohoStockProduct || !isZohoSizeStockFresh(zohoStockProduct, cartItem.size)
        : !zohoStockProduct || getZohoStockStatus(zohoStockProduct) === "unavailable")) {
        return NextResponse.json({ error: "Stock for one or more items could not be verified. Please try again later." }, { status: 409 });
      }
      if ((colors.length > 0 && !cartItem.color)
        || ((sizes.length > 0 || isShoe) && !cartItem.size)
        || (cartItem.color && !colors.includes(cartItem.color))
        || (cartItem.size && (!sizes.includes(cartItem.size) || (product.unavailable_sizes ?? []).includes(cartItem.size)))
        || (isShoe && cartItem.size && Number(product.size_stock?.[cartItem.size] ?? 0) < cartItem.quantity)) {
        return NextResponse.json({ error: "A selected product option is no longer available. Refresh your bag and try again." }, { status: 409 });
      }

      const unitPriceFils = toFils(product.price);
      const lineTotalFils = unitPriceFils * cartItem.quantity;
      subtotalFils += lineTotalFils;
      items.push({
        productId: cartItem.productId,
        name: product.name,
        imageUrl: product.image_url,
        quantity: cartItem.quantity,
        color: cartItem.color ?? null,
        size: cartItem.size ?? null,
        unitPrice: unitPriceFils / 100,
        lineTotal: lineTotalFils / 100,
      });
    }

    let coupon: { code: string; discount: number } | null = null;
    let discountFils = 0;
    if (body.couponCode !== undefined && typeof body.couponCode !== "string") {
      return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
    }
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
    if (couponCode) {
      if (!/^[A-Z0-9_-]{1,40}$/.test(couponCode)) {
        return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("checkout_coupons")
        .select("code, discount_type, discount_amount, is_active, starts_at, expires_at, minimum_subtotal, maximum_redemptions, redemption_count, reserved_redemptions")
        .ilike("code", couponCode)
        .maybeSingle();
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") {
          return NextResponse.json({ error: "Coupon management is not set up yet. Please contact the store." }, { status: 503 });
        }
        console.error("Unable to look up checkout coupon.", error.message);
        return NextResponse.json({ error: "Unable to verify that coupon right now." }, { status: 500 });
      }
      const validation = validateCouponEligibility(data as CouponForValidation | null, subtotalFils);
      if ("error" in validation) return NextResponse.json({ error: validation.error }, { status: 400 });
      discountFils = validation.discountFils;
      coupon = { code: validation.code, discount: discountFils / 100 };
    }

    const totals = calculateCheckoutTotals(subtotalFils, discountFils);
    return NextResponse.json({
      items,
      coupon,
      subtotal: totals.subtotalFils / 100,
      deliveryFee: totals.deliveryFeeFils / 100,
      handlingFee: totals.handlingFeeFils / 100,
      discount: totals.discountFils / 100,
      total: totals.totalFils / 100,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to prepare checkout quote.", error);
    return NextResponse.json({ error: "Unable to prepare your order summary right now." }, { status: 500 });
  }
}
