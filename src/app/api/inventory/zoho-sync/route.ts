import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabase, getFirebaseIdentity } from "@/lib/server-auth";
import { getZohoStockUpdates, normalizeZohoSku, ZohoInventoryError } from "@/lib/zoho-inventory";

export const runtime = "nodejs";

const isCronAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!secret || !providedSecret) return false;

  const expected = Buffer.from(secret);
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
};

const syncInventory = async (request: Request) => {
  if (!isCronAuthorized(request)) {
    const identity = await getFirebaseIdentity(request);
    if (!identity || !isAdminEmail(identity.email)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Product storage is not configured." }, { status: 500 });
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, sku, zoho_product_id, product_type");

  if (productsError) {
    console.error("Zoho stock sync could not load website SKUs:", productsError.message);
    return NextResponse.json({ error: "Unable to load website product SKUs." }, { status: 500 });
  }

  const allWebsiteProducts = (products ?? [])
    .filter((product) => product.product_type !== "shoe")
    .map((product) => ({
      id: Number(product.id),
      sku: typeof product.sku === "string" && product.sku.trim() ? normalizeZohoSku(product.sku) : null,
      zoho_product_id: typeof product.zoho_product_id === "string" && product.zoho_product_id.trim() ? product.zoho_product_id.trim() : null,
    }));
  const websiteProducts = allWebsiteProducts.filter((product) => product.sku || product.zoho_product_id);

  try {
    const updates = await getZohoStockUpdates(websiteProducts);
    let updatedProductCount = 0;

    if (updates.length > 0) {
      const { data, error } = await supabase.rpc("sync_zoho_product_stock", { p_updates: updates });
      if (error) {
        console.error("Zoho stock sync database update failed:", error.message);
        if (error.code === "42703" || error.code === "PGRST202") {
          return NextResponse.json({ error: "Apply SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql in Supabase before syncing stock." }, { status: 503 });
        }
        if (error.message.includes("ZOHO_STOCK_BELOW_UNRECORDED_PAID_SALES:")) {
          return NextResponse.json({ error: "Zoho stock is below paid website sales not yet recorded as invoiced. If those sales are already invoiced in Zoho, record the invoice in Admin and retry; otherwise verify the stock before syncing." }, { status: 409 });
        }
        if (error.message.includes("ZOHO_STOCK_BELOW_ACTIVE_CHECKOUT_RESERVATIONS:")) {
          return NextResponse.json({ error: "Zoho stock is below active checkout reservations. Wait for those checkouts to finish or expire, then retry." }, { status: 409 });
        }
        return NextResponse.json({ error: "Zoho stock was retrieved but could not be saved." }, { status: 500 });
      }
      updatedProductCount = Number(data);
      if (!Number.isInteger(updatedProductCount)) {
        console.error("Zoho stock sync returned an invalid database update count.");
        return NextResponse.json({ error: "Zoho stock update did not return a valid result." }, { status: 500 });
      }
    }

    const matchedZohoIds = new Set(updates.map((update) => update.zoho_product_id));
    const matchedSkus = new Set(updates.map((update) => update.sku && normalizeZohoSku(update.sku)).filter(Boolean));
    const unmatchedProducts = allWebsiteProducts.filter((product) => (
      !(product.sku || product.zoho_product_id)
      ||
      !(product.zoho_product_id && matchedZohoIds.has(product.zoho_product_id))
      && !(product.sku && matchedSkus.has(normalizeZohoSku(product.sku)))
    ));
    return NextResponse.json({
      success: true,
      updatedProductCount,
      unmatchedWebsiteSkus: unmatchedProducts.map((product) => product.sku ?? product.zoho_product_id ?? `Product #${product.id}`),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof ZohoInventoryError
      ? error.message
      : "Unexpected error while syncing Zoho inventory.";
    console.error("Zoho stock sync failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
};

export async function GET(request: Request) {
  return syncInventory(request);
}

export async function POST(request: Request) {
  return syncInventory(request);
}
