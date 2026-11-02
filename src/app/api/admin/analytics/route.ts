import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";
import { getZohoLowStockThreshold, getZohoStockMaxAgeMs, isZohoStockFresh } from "@/lib/zoho-stock-policy";

export const runtime = "nodejs";

const paidStatuses = ["paid", "processing", "shipped", "delivered"];
const allowedPeriods = [7, 30, 90] as const;
type Period = (typeof allowedPeriods)[number];
type OrderRow = {
  id: string;
  customer_phone: string | null;
  city: string | null;
  total: number | string | null;
  status: string;
  created_at: string;
  stripe_paid_at: string | null;
  order_items: Array<{
    product_id: number | null;
    product_name: string;
    quantity: number;
    unit_price: number | string;
  }> | null;
};

const unauthorized = (request: Request) =>
  getFirebaseIdentity(request).then((identity) => {
    if (!identity) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!isAdminEmail(identity.email)) return NextResponse.json({ error: "Access denied." }, { status: 403 });
    return null;
  });

export async function GET(request: Request) {
  const authResponse = await unauthorized(request);
  if (authResponse) return authResponse;

  const supabase = createAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Analytics storage is not configured." }, { status: 500 });

  const requestedPeriod = Number(new URL(request.url).searchParams.get("period") ?? 30);
  if (!allowedPeriods.includes(requestedPeriod as Period)) {
    return NextResponse.json({ error: "Choose an analytics period of 7, 30, or 90 days." }, { status: 400 });
  }
  const period = requestedPeriod as Period;
  const generatedAt = new Date();
  const periodStart = new Date(generatedAt.getTime() - period * 24 * 60 * 60 * 1000);
  const periodStartIso = periodStart.toISOString();
  const lowStockThreshold = getZohoLowStockThreshold();
  const stockMaxAgeMs = getZohoStockMaxAgeMs();

  const orders: OrderRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, customer_phone, city, total, status, created_at, stripe_paid_at, order_items(product_id, product_name, quantity, unit_price)")
      .or(`created_at.gte.${periodStartIso},stripe_paid_at.gte.${periodStartIso}`)
      .order("created_at", { ascending: false })
      .range(offset, offset + 999);

    if (error) {
      console.error("Admin analytics could not load order data:", error.message);
      if (error.code === "42703" && /stripe_paid_at/i.test(error.message)) {
        return NextResponse.json({ error: "Apply SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql before using sales analytics." }, { status: 503 });
      }
      return NextResponse.json({ error: "Unable to load order analytics." }, { status: 500 });
    }

    const batch = (data ?? []) as OrderRow[];
    orders.push(...batch);
    if (batch.length < 1000) break;
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, category, stock, size_stock, is_active, sku, zoho_product_id, zoho_stock_synced_at, zoho_size_skus, zoho_size_item_ids, zoho_size_stock_synced_at");

  if (productsError) {
    console.error("Admin analytics could not load product data:", productsError.message);
    return NextResponse.json({ error: "Unable to load product analytics." }, { status: 500 });
  }

  const productCategories = new Map<number, string>();
  const topProducts = new Map<string, { name: string; quantity: number; revenue: number }>();
  const categoryRevenue = new Map<string, number>();
  const cityOrders = new Map<string, number>();
  const dailySales = new Map<string, { revenue: number; orders: number }>();
  const customerOrders = new Map<string, number>();
  let revenue = 0;
  let paidOrders = 0;
  let pendingPaymentOrders = 0;
  let cancelledOrders = 0;

  for (const product of products ?? []) {
    const productId = Number(product.id);
    if (Number.isFinite(productId)) productCategories.set(productId, product.category || "Other");
  }

  for (const order of orders) {
    const createdAt = new Date(order.created_at);
    const createdInPeriod = createdAt >= periodStart && createdAt <= generatedAt;
    if (createdInPeriod && order.status === "awaiting_payment") pendingPaymentOrders += 1;
    if (createdInPeriod && order.status === "cancelled") cancelledOrders += 1;
    if (!paidStatuses.includes(order.status)) continue;

    const paidAt = new Date(order.stripe_paid_at || order.created_at);
    if (Number.isNaN(paidAt.getTime()) || paidAt < periodStart || paidAt > generatedAt) continue;

    const orderTotal = Number(order.total);
    if (!Number.isFinite(orderTotal) || orderTotal < 0) continue;
    revenue += orderTotal;
    paidOrders += 1;

    const day = paidAt.toISOString().slice(0, 10);
    const daily = dailySales.get(day) ?? { revenue: 0, orders: 0 };
    daily.revenue += orderTotal;
    daily.orders += 1;
    dailySales.set(day, daily);

    const phone = order.customer_phone?.replace(/\D/g, "");
    if (phone) customerOrders.set(phone, (customerOrders.get(phone) ?? 0) + 1);
    const city = order.city?.trim() || "Not specified";
    cityOrders.set(city, (cityOrders.get(city) ?? 0) + 1);

    for (const item of order.order_items ?? []) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) continue;
      const itemRevenue = quantity * unitPrice;
      const productName = item.product_name || "Unknown product";
      const product = topProducts.get(productName) ?? { name: productName, quantity: 0, revenue: 0 };
      product.quantity += quantity;
      product.revenue += itemRevenue;
      topProducts.set(productName, product);
      const category = productCategories.get(Number(item.product_id)) ?? "Other";
      categoryRevenue.set(category, (categoryRevenue.get(category) ?? 0) + itemRevenue);
    }
  }

  const customerCount = customerOrders.size;
  const repeatCustomerCount = [...customerOrders.values()].filter((count) => count > 1).length;
  const { count: pendingFulfillment, error: fulfillmentError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["paid", "processing"]);
  const { count: awaitingPayment, error: awaitingError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "awaiting_payment");

  if (fulfillmentError || awaitingError) {
    console.error("Admin analytics could not load current order counts:", fulfillmentError?.message ?? awaitingError?.message);
    return NextResponse.json({ error: "Unable to load current order status counts." }, { status: 500 });
  }

  let activeProducts = 0;
  let outOfStockProducts = 0;
  let lowStockProducts = 0;
  let unitsAvailable = 0;
  let unmappedActiveProducts = 0;
  let staleMappedProducts = 0;
  let lastStockSyncAt: string | null = null;

  for (const product of products ?? []) {
    if (!product.is_active) continue;
    activeProducts += 1;
    const sizeStock = product.size_stock && typeof product.size_stock === "object" && !Array.isArray(product.size_stock)
      ? Object.values(product.size_stock as Record<string, unknown>)
      : [];
    const stock = sizeStock.length
      ? sizeStock.reduce<number>((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0)
      : Math.max(0, Number(product.stock) || 0);
    unitsAvailable += stock;
    if (stock < 1) outOfStockProducts += 1;
    else if (stock <= lowStockThreshold) lowStockProducts += 1;

    const hasProductMapping = Boolean(product.sku || product.zoho_product_id);
    const sizeMappingRecords = [product.zoho_size_skus, product.zoho_size_item_ids]
      .filter((mapping) => mapping && typeof mapping === "object" && !Array.isArray(mapping)) as Record<string, unknown>[];
    const sizeMappings = new Set(sizeMappingRecords.flatMap((mapping) => Object.entries(mapping)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([size]) => size)));
    const hasSizeMapping = sizeMappings.size > 0;
    if (!hasProductMapping && !hasSizeMapping) unmappedActiveProducts += 1;

    const sizeSyncTimes = product.zoho_size_stock_synced_at
      && typeof product.zoho_size_stock_synced_at === "object"
      && !Array.isArray(product.zoho_size_stock_synced_at)
      ? product.zoho_size_stock_synced_at as Record<string, unknown>
      : {};
    const syncTimes = hasSizeMapping
      ? [...sizeMappings].map((size) => sizeSyncTimes[size]).filter((value): value is string => typeof value === "string")
      : typeof product.zoho_stock_synced_at === "string" ? [product.zoho_stock_synced_at] : [];
    for (const timestamp of syncTimes) {
      const timestampMs = Date.parse(timestamp);
      if (Number.isFinite(timestampMs) && timestampMs <= generatedAt.getTime()
        && (!lastStockSyncAt || timestampMs > Date.parse(lastStockSyncAt))) {
        lastStockSyncAt = timestamp;
      }
    }
    if ((hasProductMapping || hasSizeMapping) && !syncTimes.some((timestamp) => isZohoStockFresh(timestamp, stockMaxAgeMs, generatedAt.getTime()))) {
      staleMappedProducts += 1;
    }
  }

  return NextResponse.json({
    period,
    generatedAt: generatedAt.toISOString(),
    kpis: {
      revenue: Number(revenue.toFixed(2)),
      paidOrders,
      averageOrderValue: paidOrders ? Number((revenue / paidOrders).toFixed(2)) : 0,
      repeatCustomerCount,
      customerCount,
      repeatCustomerRate: customerCount ? Number((repeatCustomerCount / customerCount * 100).toFixed(1)) : 0,
    },
    trends: [...dailySales.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({ date, ...values })),
    topProducts: [...topProducts.values()]
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5),
    categoryRevenue: [...categoryRevenue.entries()]
      .map(([category, amount]) => ({ category, revenue: Number(amount.toFixed(2)) }))
      .sort((left, right) => right.revenue - left.revenue),
    topCities: [...cityOrders.entries()]
      .map(([city, count]) => ({ city, orders: count }))
      .sort((left, right) => right.orders - left.orders)
      .slice(0, 5),
    orderStatuses: {
      awaitingPayment: awaitingPayment ?? pendingPaymentOrders,
      pendingFulfillment: pendingFulfillment ?? 0,
      cancelledInPeriod: cancelledOrders,
    },
    inventory: {
      activeProducts,
      outOfStockProducts,
      lowStockProducts,
      unitsAvailable,
      unmappedActiveProducts,
      staleMappedProducts,
      lowStockThreshold,
      lastStockSyncAt,
      staleAfterSeconds: Math.floor(stockMaxAgeMs / 1000),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
