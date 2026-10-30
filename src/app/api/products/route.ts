import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/server-auth";
import { getZohoLowStockThreshold, getZohoStockStatus } from "@/lib/zoho-stock-policy";

export async function GET() {
  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Product catalog is not configured." }, { status: 500 });

  const { data: products, error } = await supabase
    .from("products")
    .select("id, product_type, size_category, size_stock, name, brand, category, price, image_url, description, rating, reviews, stock, colors, sizes, unavailable_sizes, sku, zoho_product_id, zoho_stock_synced_at")
    .eq("is_active", true)
    .in("category", ["Badminton", "Tennis", "Squash", "Accessories"])
    .order("created_at", { ascending: false });

  let productRows = products ?? [];
  if (error) {
    if (error.code !== "42703" || !/product_type|size_category|size_stock|sku|zoho_product_id|zoho_stock_synced_at/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: legacyProducts, error: legacyError } = await supabase
      .from("products")
      .select("id, name, brand, category, price, image_url, description, rating, reviews, stock, colors, sizes, unavailable_sizes")
      .eq("is_active", true)
      .in("category", ["Badminton", "Tennis", "Squash", "Accessories"])
      .order("created_at", { ascending: false });
    if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });
    productRows = (legacyProducts ?? []).map((product) => ({
      ...product,
      product_type: null,
      size_category: null,
      size_stock: null,
      sku: null,
      zoho_product_id: null,
      zoho_stock_synced_at: null,
    }));
  }

  if (productRows.length === 0) {
    return NextResponse.json({ products: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: reservations, error: reservationError } = await supabase
    .from("stripe_order_stock_reservations")
    .select("product_id, size_key, quantity")
    .in("product_id", productRows.map((product) => product.id));
  if (reservationError?.code === "42P01") {
    return NextResponse.json({ error: "Run SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql in Supabase to enable checkout inventory reservations." }, { status: 503 });
  }
  let reservationRows = reservations ?? [];
  if (reservationError?.code === "42703" && /size_key/i.test(reservationError.message)) {
    const legacyReservations = await supabase
      .from("stripe_order_stock_reservations")
      .select("product_id, quantity")
      .in("product_id", productRows.map((product) => product.id));
    if (legacyReservations.error) return NextResponse.json({ error: "Unable to calculate available product stock." }, { status: 500 });
    reservationRows = (legacyReservations.data ?? []).map((reservation) => ({ ...reservation, size_key: "" }));
  } else if (reservationError) {
    return NextResponse.json({ error: "Unable to calculate available product stock." }, { status: 500 });
  }

  const reservedByProduct = new Map<number, number>();
  const reservedBySize = new Map<string, number>();
  const legacySizeReservations = new Set<number>();
  for (const reservation of reservationRows) {
    const productId = Number(reservation.product_id);
    reservedByProduct.set(
      productId,
      (reservedByProduct.get(productId) ?? 0) + Number(reservation.quantity),
    );
    if (reservation.size_key) {
      const reservationKey = `${productId}:${reservation.size_key}`;
      reservedBySize.set(reservationKey, (reservedBySize.get(reservationKey) ?? 0) + Number(reservation.quantity));
    } else {
      legacySizeReservations.add(productId);
    }
  }
  const productsWithAvailableStock = productRows.map((product) => {
    const productId = Number(product.id);
    const storefrontProduct = { ...product };
    delete storefrontProduct.sku;
    delete storefrontProduct.zoho_product_id;
    delete storefrontProduct.zoho_stock_synced_at;
    const stockStatus = getZohoStockStatus(product);
    const inventoryFields = {
      stock_status: stockStatus,
      low_stock_threshold: getZohoLowStockThreshold(),
    };
    const productSizeStock = product.size_stock && typeof product.size_stock === "object" && !Array.isArray(product.size_stock)
      ? product.size_stock as Record<string, number>
      : null;
    if (product.product_type === "shoe" && productSizeStock) {
      const size_stock = Object.fromEntries(Object.entries(productSizeStock).map(([size, quantity]) => [
        size,
        legacySizeReservations.has(productId)
          ? 0
          : Math.max(0, Number(quantity ?? 0) - (reservedBySize.get(`${productId}:${size}`) ?? 0)),
      ]));
      const sizes = Array.isArray(product.sizes) ? product.sizes : Object.keys(size_stock);
      return {
        ...storefrontProduct,
        ...inventoryFields,
        size_stock,
        sizes,
        unavailable_sizes: sizes.filter((size) => Number(size_stock[size] ?? 0) < 1),
        stock: Object.values(size_stock).reduce((total, quantity) => total + quantity, 0),
      };
    }
    return {
      ...storefrontProduct,
      ...inventoryFields,
      stock: stockStatus === "unavailable"
        ? 0
        : Math.max(0, Number(product.stock ?? 0) - (reservedByProduct.get(productId) ?? 0)),
    };
  });

  return NextResponse.json({ products: productsWithAvailableStock }, { headers: { "Cache-Control": "no-store" } });
}