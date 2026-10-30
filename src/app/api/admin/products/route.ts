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

const allowedCategories = ["Badminton", "Tennis", "Squash", "Accessories"];
const allowedProductTypes = ["shoe", "racquet", "other"] as const;
const allowedSizeCategories = ["mens", "womens", "kids"] as const;
const sizeOptionsByCategory: Record<(typeof allowedSizeCategories)[number], string[]> = {
  mens: Array.from({ length: 14 }, (_, index) => `UK ${index + 2}`),
  womens: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
  kids: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
};
const normalizeSku = (sku: string | null | undefined) => sku?.trim().toUpperCase() || null;
const databaseErrorResponse = (error: { code?: string; message: string }) => {
  if ((error.code === "42703" || error.code === "PGRST204") && /zoho_size_skus|zoho_size_item_ids|zoho_size_stock_synced_at/i.test(error.message)) {
    return NextResponse.json({ error: "Run SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql before mapping shoe sizes to Zoho." }, { status: 503 });
  }
  if ((error.code === "42703" || error.code === "PGRST204") && /product_type|size_category|size_stock|colors|sizes|unavailable_sizes/i.test(error.message)) {
    return NextResponse.json({ error: "Run the latest SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql in Supabase before adding or editing product options." }, { status: 503 });
  }
  if (error.code === "23505") {
    return NextResponse.json({ error: "That SKU or Zoho product ID is already assigned to another product." }, { status: 409 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
};
const normalizeZohoProductId = (value: string | null | undefined) => value?.trim() || null;
const normalizeStringRecord = (value: unknown): Record<string, string> => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  : {};
const normalizeOptions = (value: unknown, label: string) => {
  if (value === undefined) return { values: undefined as string[] | undefined, error: undefined };
  if (!Array.isArray(value) || value.length > 30 || value.some((option) => typeof option !== "string")) {
    return { values: undefined, error: `Enter up to 30 valid ${label.toLowerCase()} options.` };
  }
  const values = value.map((option: string) => option.trim()).filter(Boolean);
  if (values.some((option) => option.length > 40)) {
    return { values: undefined, error: `Each ${label.toLowerCase()} option must be 40 characters or fewer.` };
  }
  if (new Set(values.map((option) => option.toLocaleLowerCase())).size !== values.length) {
    return { values: undefined, error: `${label} options must be unique.` };
  }
  return { values, error: undefined };
};
const normalizeSizeStock = (value: unknown, allowedSizes: string[]) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { values: undefined, error: "Enter a quantity for every shoe size." };
  }
  const entries = Object.entries(value);
  if (entries.some(([size, quantity]) => !allowedSizes.includes(size) || !Number.isInteger(quantity) || Number(quantity) < 0 || Number(quantity) > 100000)) {
    return { values: undefined, error: "Shoe size quantities must be whole numbers from 0 to 100,000." };
  }
  return {
    values: Object.fromEntries(allowedSizes.map((size) => [size, Number((value as Record<string, unknown>)[size] ?? 0)])),
    error: undefined,
  };
};
const normalizeSizeSkus = (value: unknown, allowedSizes: string[]) => {
  if (value === undefined) return { values: undefined as Record<string, string> | undefined, error: undefined };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { values: undefined, error: "Enter a Zoho SKU for each mapped shoe size." };
  }
  const mappings: Record<string, string> = {};
  for (const [size, sku] of Object.entries(value)) {
    if (!allowedSizes.includes(size) || typeof sku !== "string" || sku.trim().length > 128) {
      return { values: undefined, error: "Each shoe-size Zoho SKU must be valid and match the selected size range." };
    }
    if (sku.trim()) mappings[size] = sku.trim();
  }
  const normalizedSkus = Object.values(mappings).map((sku) => sku.toUpperCase());
  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    return { values: undefined, error: "Each shoe size must use a different Zoho SKU." };
  }
  return { values: mappings, error: undefined };
};
const ensureUniqueSizeSkus = async (
  supabase: NonNullable<ReturnType<typeof createAdminSupabase>>,
  mappings: Record<string, string>,
  productId?: number,
) => {
  const normalized = new Set(Object.values(mappings).map((sku) => sku.toUpperCase()));
  if (normalized.size === 0) return null;
  const { data: products, error } = await supabase.from("products").select("id, sku, zoho_size_skus");
  if (error) return error;
  for (const product of products ?? []) {
    if (Number(product.id) === productId) continue;
    if (typeof product.sku === "string" && normalized.has(product.sku.trim().toUpperCase())) {
      return { code: "23505", message: "That Zoho SKU is already assigned to another product." };
    }
    const savedMappings = product.zoho_size_skus && typeof product.zoho_size_skus === "object"
      ? Object.values(product.zoho_size_skus as Record<string, unknown>)
      : [];
    if (savedMappings.some((sku) => typeof sku === "string" && normalized.has(sku.trim().toUpperCase()))) {
      return { code: "23505", message: "That Zoho SKU is already assigned to a shoe size." };
    }
  }
  return null;
};

export async function GET(request: Request) {
  try {
    await ensureAdmin(request);
    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Product storage is not configured." }, { status: 500 });

    const { data: products, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const productsWithSizeStock = (products ?? []).map((product) => {
      if (product.product_type !== "shoe") return product;
      const sizeStock = product.size_stock && typeof product.size_stock === "object" && !Array.isArray(product.size_stock)
        ? product.size_stock as Record<string, number>
        : {};
      return {
        ...product,
        colors: [],
        stock: Object.values(sizeStock).reduce((total, quantity) => total + Number(quantity ?? 0), 0),
      };
    });
    return NextResponse.json({ products: productsWithSizeStock });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Access denied" ? 403 : 401 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdmin(request);
    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Product storage is not configured." }, { status: 500 });

    const body = await request.json() as {
      name?: string;
      brand?: string;
      category?: string;
      price?: string | number;
      image_url?: string;
      stock?: string | number;
      is_active?: boolean;
      sku?: string | null;
      zoho_product_id?: string | null;
      colors?: unknown;
      sizes?: unknown;
      unavailable_sizes?: unknown;
      size_stock?: unknown;
      zoho_size_skus?: unknown;
      product_type?: unknown;
      size_category?: unknown;
    };

    const colors = normalizeOptions(body.colors, "Color");
    const sizes = normalizeOptions(body.sizes, "Size");
    const unavailableSizes = normalizeOptions(body.unavailable_sizes, "Out-of-stock size");
    if (colors.error || sizes.error || unavailableSizes.error) {
      return NextResponse.json({ error: colors.error || sizes.error || unavailableSizes.error }, { status: 400 });
    }
    if (unavailableSizes.values?.some((size) => !sizes.values?.includes(size))) {
      return NextResponse.json({ error: "Every out-of-stock size must also be included in available sizes." }, { status: 400 });
    }
    if (typeof body.product_type !== "string" || !allowedProductTypes.includes(body.product_type as (typeof allowedProductTypes)[number])) {
      return NextResponse.json({ error: "Choose shoes, racquet, or other gear as the product type." }, { status: 400 });
    }
    const productType = body.product_type as (typeof allowedProductTypes)[number];
    const shoeSizeCategory = body.size_category as (typeof allowedSizeCategories)[number] | undefined;
    if (productType === "shoe" && (typeof body.size_category !== "string" || !allowedSizeCategories.includes(body.size_category as (typeof allowedSizeCategories)[number]))) {
      return NextResponse.json({ error: "Choose a size range for the shoe." }, { status: 400 });
    }
    const sizeStock = productType === "shoe" && shoeSizeCategory
      ? normalizeSizeStock(body.size_stock, sizeOptionsByCategory[shoeSizeCategory])
      : { values: undefined, error: undefined };
    if (sizeStock.error) return NextResponse.json({ error: sizeStock.error }, { status: 400 });
    const sizeSkus = productType === "shoe" && shoeSizeCategory
      ? normalizeSizeSkus(body.zoho_size_skus, sizeOptionsByCategory[shoeSizeCategory])
      : { values: productType === "shoe" ? {} : undefined, error: undefined };
    if (sizeSkus.error) return NextResponse.json({ error: sizeSkus.error }, { status: 400 });
    const sizeSkuConflict = await ensureUniqueSizeSkus(supabase, sizeSkus.values ?? {});
    if (sizeSkuConflict) {
      if (sizeSkuConflict.code === "42703" || sizeSkuConflict.code === "PGRST204") {
        return NextResponse.json({ error: "Run SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql before mapping shoe sizes to Zoho." }, { status: 503 });
      }
      if (sizeSkuConflict.code === "23505") return NextResponse.json({ error: sizeSkuConflict.message }, { status: 409 });
      return NextResponse.json({ error: "Unable to verify that each shoe-size Zoho SKU is unique." }, { status: 500 });
    }
    if (productType === "shoe") {
      const validSizes = sizeOptionsByCategory[body.size_category as (typeof allowedSizeCategories)[number]];
      if (sizes.values?.some((size) => !validSizes.includes(size))) {
        return NextResponse.json({ error: "One or more shoe sizes do not match the selected size range." }, { status: 400 });
      }
    }

    if (!body.name?.trim() || !body.brand?.trim() || !body.category || !allowedCategories.includes(body.category)) {
      return NextResponse.json({ error: "Name, brand, and a valid category are required." }, { status: 400 });
    }
    if (body.sku !== undefined && body.sku !== null && typeof body.sku !== "string") {
      return NextResponse.json({ error: "Enter a valid SKU." }, { status: 400 });
    }
    if (body.zoho_product_id !== undefined && body.zoho_product_id !== null && typeof body.zoho_product_id !== "string") {
      return NextResponse.json({ error: "Enter a valid Zoho product ID." }, { status: 400 });
    }
    if (typeof body.zoho_product_id === "string" && body.zoho_product_id.trim().length > 128) {
      return NextResponse.json({ error: "Zoho product ID must be 128 characters or fewer." }, { status: 400 });
    }

    const numericPrice = Number(body.price ?? 0);
    const storedSizeStock = sizeStock.values ? { ...sizeStock.values } : undefined;
    for (const size of Object.keys(sizeSkus.values ?? {})) {
      if (storedSizeStock) storedSizeStock[size] = 0;
    }
    const shoeStockTotal = storedSizeStock ? Object.values(storedSizeStock).reduce((total, quantity) => total + quantity, 0) : 0;
    const numericStock = productType === "shoe" ? shoeStockTotal : Number(body.stock ?? 0);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isInteger(numericStock) || numericStock < 0) {
      return NextResponse.json({ error: "Enter a valid price and stock quantity." }, { status: 400 });
    }
    if (!body.image_url?.trim()) {
      return NextResponse.json({ error: "Upload a product image before saving." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        name: body.name.trim(),
        brand: body.brand.trim(),
        category: body.category.trim(),
        price: numericPrice,
        image_url: body.image_url.trim(),
        stock: numericStock,
        sku: productType === "shoe" ? null : normalizeSku(body.sku),
        zoho_product_id: productType === "shoe" ? null : normalizeZohoProductId(body.zoho_product_id),
        ...(productType === "shoe" ? { zoho_size_skus: sizeSkus.values ?? {} } : {}),
        ...(productType === "shoe" ? { zoho_size_item_ids: {} } : {}),
        ...(productType === "shoe" ? { zoho_size_stock_synced_at: {} } : {}),
        is_active: body.is_active ?? true,
        colors: productType === "shoe" ? [] : colors.values ?? [],
        sizes: productType === "shoe" && shoeSizeCategory ? sizeOptionsByCategory[shoeSizeCategory] : sizes.values ?? [],
        unavailable_sizes: productType === "shoe" && storedSizeStock
          ? Object.entries(storedSizeStock).filter(([, quantity]) => quantity === 0).map(([size]) => size)
          : unavailableSizes.values ?? [],
        ...(storedSizeStock ? { size_stock: storedSizeStock } : {}),
        product_type: productType,
        size_category: productType === "shoe" ? body.size_category : null,
      })
      .select()
      .single();

    if (error) return databaseErrorResponse(error);
    return NextResponse.json({ product: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Access denied" ? 403 : 401 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureAdmin(request);
    const supabase = createAdminSupabase();
    if (!supabase) return NextResponse.json({ error: "Product storage is not configured." }, { status: 500 });

    const body = await request.json() as {
      id?: number;
      stock?: string | number;
      price?: string | number;
      is_active?: boolean;
      image_url?: string;
      brand?: string;
      category?: string;
      name?: string;
      sku?: string | null;
      zoho_product_id?: string | null;
      colors?: unknown;
      sizes?: unknown;
      unavailable_sizes?: unknown;
      size_stock?: unknown;
      zoho_size_skus?: unknown;
      product_type?: unknown;
      size_category?: unknown;
    };

    if (!body.id) return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    const { data: existingProduct, error: existingProductError } = await supabase
      .from("products")
      .select("product_type, size_category, zoho_size_skus, zoho_size_item_ids, zoho_size_stock_synced_at")
      .eq("id", body.id)
      .maybeSingle();
    if (existingProductError) return databaseErrorResponse(existingProductError);
    if (!existingProduct) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const colors = normalizeOptions(body.colors, "Color");
    const sizes = normalizeOptions(body.sizes, "Size");
    const unavailableSizes = normalizeOptions(body.unavailable_sizes, "Out-of-stock size");
    if (colors.error || sizes.error || unavailableSizes.error) {
      return NextResponse.json({ error: colors.error || sizes.error || unavailableSizes.error }, { status: 400 });
    }
    if (unavailableSizes.values?.some((size) => !sizes.values?.includes(size))) {
      return NextResponse.json({ error: "Every out-of-stock size must also be included in available sizes." }, { status: 400 });
    }
    if (body.product_type !== undefined && (typeof body.product_type !== "string" || !allowedProductTypes.includes(body.product_type as (typeof allowedProductTypes)[number]))) {
      return NextResponse.json({ error: "Choose shoes, racquet, or other gear as the product type." }, { status: 400 });
    }
    if (body.size_category !== undefined && body.size_category !== null && (typeof body.size_category !== "string" || !allowedSizeCategories.includes(body.size_category as (typeof allowedSizeCategories)[number]))) {
      return NextResponse.json({ error: "Choose a valid shoe size range." }, { status: 400 });
    }
    const productType = (body.product_type ?? existingProduct.product_type ?? "other") as (typeof allowedProductTypes)[number];
    const sizeCategory = (body.size_category ?? existingProduct.size_category) as (typeof allowedSizeCategories)[number] | null | undefined;
    const sizeStock = productType === "shoe" && sizeCategory
      ? normalizeSizeStock(body.size_stock, sizeOptionsByCategory[sizeCategory])
      : { values: undefined, error: undefined };
    if (sizeStock.error) return NextResponse.json({ error: sizeStock.error }, { status: 400 });
    const sizeSkus = productType === "shoe" && sizeCategory
      ? normalizeSizeSkus(body.zoho_size_skus, sizeOptionsByCategory[sizeCategory])
      : { values: undefined as Record<string, string> | undefined, error: undefined };
    if (sizeSkus.error) return NextResponse.json({ error: sizeSkus.error }, { status: 400 });
    const sizeSkuConflict = sizeSkus.values
      ? await ensureUniqueSizeSkus(supabase, sizeSkus.values, body.id)
      : null;
    if (sizeSkuConflict) {
      if (sizeSkuConflict.code === "42703" || sizeSkuConflict.code === "PGRST204") {
        return NextResponse.json({ error: "Run SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql before mapping shoe sizes to Zoho." }, { status: 503 });
      }
      if (sizeSkuConflict.code === "23505") return NextResponse.json({ error: sizeSkuConflict.message }, { status: 409 });
      return NextResponse.json({ error: "Unable to verify that each shoe-size Zoho SKU is unique." }, { status: 500 });
    }
    const savedSizeSkus = normalizeStringRecord(existingProduct.zoho_size_skus);
    const changedSizeKeys = new Set(
      sizeSkus.values === undefined
        ? []
        : [...new Set([...Object.keys(savedSizeSkus), ...Object.keys(sizeSkus.values)])]
          .filter((size) => (savedSizeSkus[size] ?? "").trim().toUpperCase() !== (sizeSkus.values?.[size] ?? "").trim().toUpperCase()),
    );
    if (productType === "shoe" && !sizeCategory) return NextResponse.json({ error: "Choose a size range for the shoe." }, { status: 400 });
    if (productType === "shoe" && sizeCategory && sizes.values?.some((size) => !sizeOptionsByCategory[sizeCategory].includes(size))) {
      return NextResponse.json({ error: "One or more shoe sizes do not match the selected size range." }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (colors.values !== undefined) updatePayload.colors = productType === "shoe" ? [] : colors.values;
    if (productType === "shoe" && sizeCategory) {
      updatePayload.colors = [];
      updatePayload.sizes = sizeOptionsByCategory[sizeCategory];
      updatePayload.unavailable_sizes = Object.entries(sizeStock.values ?? {}).filter(([, quantity]) => quantity === 0).map(([size]) => size);
      updatePayload.size_stock = sizeStock.values;
    } else {
      if (sizes.values !== undefined) updatePayload.sizes = sizes.values;
      if (unavailableSizes.values !== undefined) updatePayload.unavailable_sizes = unavailableSizes.values;
    }
    if (body.product_type !== undefined) updatePayload.product_type = productType;
    if (body.size_category !== undefined) updatePayload.size_category = productType === "shoe" ? sizeCategory : null;
    if (productType === "shoe") {
      updatePayload.sku = null;
      updatePayload.zoho_product_id = null;
    } else if (body.product_type !== undefined && body.product_type !== "shoe") {
      updatePayload.zoho_size_skus = {};
      updatePayload.zoho_size_item_ids = {};
      updatePayload.zoho_size_stock_synced_at = {};
    }
    if (body.name !== undefined) {
      if (!body.name.trim()) return NextResponse.json({ error: "Product name cannot be empty." }, { status: 400 });
      updatePayload.name = body.name.trim();
    }
    if (body.brand) updatePayload.brand = body.brand.trim();
    if (body.category !== undefined) {
      if (!allowedCategories.includes(body.category)) return NextResponse.json({ error: "Invalid product category." }, { status: 400 });
      updatePayload.category = body.category;
    }
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
      updatePayload.price = price;
    }
    if (body.stock !== undefined) {
      const stock = Number(body.stock);
      if (!Number.isInteger(stock) || stock < 0) return NextResponse.json({ error: "Enter a valid stock quantity." }, { status: 400 });
      if (productType !== "shoe") {
        const { error: stockError } = await supabase.rpc("set_product_stock_with_reservations", {
          p_product_id: body.id,
          p_stock: stock,
        });
        if (stockError?.code === "42883" || stockError?.code === "42P01") {
          return NextResponse.json({ error: "Run SUPABASE_STRIPE_CHECKOUT_MIGRATION.sql before updating checkout inventory." }, { status: 503 });
        }
        if (stockError?.message.includes("STOCK_BELOW_CHECKOUT_RESERVATIONS:")) {
          const reservedStock = stockError.message.split(":").at(-1);
          return NextResponse.json({ error: `This product has ${reservedStock} item(s) reserved in open checkouts. Enter at least ${reservedStock} in stock.` }, { status: 409 });
        }
        if (stockError?.message.includes("PRODUCT_NOT_FOUND")) return NextResponse.json({ error: "Product not found." }, { status: 404 });
        if (stockError) return NextResponse.json({ error: "Unable to safely update product stock." }, { status: 500 });
      }
    }
    const savedSizeSkuValues = Object.values(normalizeStringRecord(existingProduct.zoho_size_skus));
    const effectiveSizeSkus = sizeSkus.values !== undefined ? Object.values(sizeSkus.values) : savedSizeSkuValues;
    const hasMappedZohoSizes = productType === "shoe"
      && effectiveSizeSkus.some((sku) => typeof sku === "string" && sku.trim().length > 0);
    if (hasMappedZohoSizes) {
      delete updatePayload.size_stock;
      delete updatePayload.sizes;
      delete updatePayload.unavailable_sizes;
      delete updatePayload.stock;
    }
    if (sizeStock.values && productType === "shoe" && !hasMappedZohoSizes) {
      const { error: sizeStockError } = await supabase.rpc("set_product_size_stock_with_reservations", {
        p_product_id: body.id,
        p_size_category: sizeCategory,
        p_size_stock: sizeStock.values,
      });
      if (sizeStockError?.code === "42883" || sizeStockError?.code === "42P01") {
        return NextResponse.json({ error: "Run the latest SUPABASE_PRODUCT_VARIANTS_MIGRATION.sql before editing shoe inventory." }, { status: 503 });
      }
      if (sizeStockError?.message.includes("SIZE_STOCK_BELOW_CHECKOUT_RESERVATIONS:")) {
        return NextResponse.json({ error: "A size has fewer pairs than are currently reserved in open checkouts. Keep each size quantity at or above its reserved quantity." }, { status: 409 });
      }
      if (sizeStockError?.message.includes("PRODUCT_NOT_FOUND")) return NextResponse.json({ error: "Product not found." }, { status: 404 });
      if (sizeStockError) return NextResponse.json({ error: "Unable to safely update shoe size inventory." }, { status: 500 });
      delete updatePayload.size_stock;
      delete updatePayload.sizes;
      delete updatePayload.unavailable_sizes;
      delete updatePayload.stock;
    }
    if (body.sku !== undefined) {
      if (body.sku !== null && typeof body.sku !== "string") {
        return NextResponse.json({ error: "Enter a valid SKU." }, { status: 400 });
      }
      if (productType !== "shoe") updatePayload.sku = normalizeSku(body.sku);
    }
    if (body.zoho_product_id !== undefined) {
      if (body.zoho_product_id !== null && typeof body.zoho_product_id !== "string") {
        return NextResponse.json({ error: "Enter a valid Zoho product ID." }, { status: 400 });
      }
      if (typeof body.zoho_product_id === "string" && body.zoho_product_id.trim().length > 128) {
        return NextResponse.json({ error: "Zoho product ID must be 128 characters or fewer." }, { status: 400 });
      }
      if (productType !== "shoe") updatePayload.zoho_product_id = normalizeZohoProductId(body.zoho_product_id);
    }
    if (sizeSkus.values !== undefined) {
      updatePayload.zoho_size_skus = sizeSkus.values;
      if (changedSizeKeys.size > 0) {
        updatePayload.zoho_size_item_ids = Object.fromEntries(
          Object.entries(normalizeStringRecord(existingProduct.zoho_size_item_ids))
            .filter(([size]) => !changedSizeKeys.has(size)),
        );
        updatePayload.zoho_size_stock_synced_at = Object.fromEntries(
          Object.entries(normalizeStringRecord(existingProduct.zoho_size_stock_synced_at))
            .filter(([size]) => !changedSizeKeys.has(size)),
        );
      }
    }
    if (body.image_url !== undefined) updatePayload.image_url = body.image_url.trim();
    if (body.is_active !== undefined) updatePayload.is_active = body.is_active;

    const productQuery = Object.keys(updatePayload).length
      ? supabase.from("products").update(updatePayload).eq("id", body.id).select().single()
      : supabase.from("products").select().eq("id", body.id).single();
    const { data, error } = await productQuery;

    if (error) return databaseErrorResponse(error);
    return NextResponse.json({ product: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "Access denied" ? 403 : 401 });
  }
}
