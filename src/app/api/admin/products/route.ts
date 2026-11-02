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
const shoeSizeCategories = ["mens", "womens", "kids"] as const;
const apparelSizeCategories = ["tshirts", "shorts", "socks"] as const;
const allowedSizeCategories = [...shoeSizeCategories, ...apparelSizeCategories] as const;
const sizeOptionsByCategory: Record<(typeof allowedSizeCategories)[number], string[]> = {
  mens: Array.from({ length: 14 }, (_, index) => `UK ${index + 2}`),
  womens: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
  kids: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
  tshirts: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  shorts: ["S", "M", "L", "XL", "XLL"],
  socks: ["Small", "Medium", "Large"],
};
const isZohoSizeProduct = (productType: (typeof allowedProductTypes)[number], sizeCategory: string | null | undefined) =>
  (productType === "shoe" && shoeSizeCategories.includes(sizeCategory as (typeof shoeSizeCategories)[number]))
  || (productType === "other" && apparelSizeCategories.includes(sizeCategory as (typeof apparelSizeCategories)[number]));
const normalizeSku = (sku: string | null | undefined) => sku?.trim().toUpperCase() || null;
const databaseErrorResponse = (error: { code?: string; message: string }) => {
  if ((error.code === "42703" || error.code === "PGRST204") && /description|specifications/i.test(error.message)) {
    return NextResponse.json({ error: "Run SUPABASE_PRODUCT_DETAILS_MIGRATION.sql in Supabase before saving product descriptions and specifications." }, { status: 503 });
  }
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
const normalizeSpecifications = (value: unknown) => {
  if (value === undefined) return { values: undefined as Record<string, string> | undefined, error: undefined };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { values: undefined, error: "Enter specifications as name and detail pairs." };
  }
  const entries = Object.entries(value);
  if (entries.length > 30) return { values: undefined, error: "Add no more than 30 product specifications." };
  const specifications: Record<string, string> = {};
  const labels = new Set<string>();
  for (const [rawLabel, rawValue] of entries) {
    if (typeof rawValue !== "string") {
      return { values: undefined, error: "Each specification must have a text name and detail." };
    }
    const label = rawLabel.trim();
    const detail = rawValue.trim();
    if (!label && !detail) continue;
    if (!label || !detail || label.length > 60 || detail.length > 500) {
      return { values: undefined, error: "Each specification needs a name (up to 60 characters) and detail (up to 500 characters)." };
    }
    const normalizedLabel = label.toLocaleLowerCase();
    if (labels.has(normalizedLabel)) return { values: undefined, error: "Specification names must be unique." };
    labels.add(normalizedLabel);
    specifications[label] = detail;
  }
  return { values: specifications, error: undefined };
};
const normalizeDescription = (value: unknown) => {
  if (value === undefined) return { value: undefined as string | undefined, error: undefined };
  if (typeof value !== "string" || value.trim().length > 3_000) {
    return { value: undefined, error: "Product description must be text with up to 3,000 characters." };
  }
  return { value: value.trim(), error: undefined };
};
const normalizeSizeSkus = (value: unknown, allowedSizes: string[]) => {
  if (value === undefined) return { values: undefined as Record<string, string> | undefined, error: undefined };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { values: undefined, error: "Enter a Zoho SKU for each mapped size." };
  }
  const mappings: Record<string, string> = {};
  for (const [size, sku] of Object.entries(value)) {
    if (!allowedSizes.includes(size) || typeof sku !== "string" || sku.trim().length > 128) {
      return { values: undefined, error: "Each size-specific Zoho SKU must be valid and match the selected size range." };
    }
    if (sku.trim()) mappings[size] = sku.trim();
  }
  const normalizedSkus = Object.values(mappings).map((sku) => sku.toUpperCase());
  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    return { values: undefined, error: "Each size must use a different Zoho SKU." };
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
      stock?: unknown;
      size_stock?: unknown;
      is_active?: boolean;
      sku?: string | null;
      zoho_product_id?: string | null;
      colors?: unknown;
      sizes?: unknown;
      unavailable_sizes?: unknown;
      zoho_size_skus?: unknown;
      product_type?: unknown;
      size_category?: unknown;
      description?: unknown;
      specifications?: unknown;
    };

    const description = normalizeDescription(body.description);
    const specifications = normalizeSpecifications(body.specifications);
    if (description.error || specifications.error) {
      return NextResponse.json({ error: description.error || specifications.error }, { status: 400 });
    }
    if (body.sku !== undefined && body.sku !== null && typeof body.sku !== "string") {
      return NextResponse.json({ error: "Enter a valid SKU." }, { status: 400 });
    }
    if (typeof body.sku === "string" && body.sku.trim().length > 128) {
      return NextResponse.json({ error: "SKU must be 128 characters or fewer." }, { status: 400 });
    }
    if (body.zoho_product_id !== undefined && body.zoho_product_id !== null && typeof body.zoho_product_id !== "string") {
      return NextResponse.json({ error: "Enter a valid Zoho product ID." }, { status: 400 });
    }
    if (typeof body.zoho_product_id === "string" && body.zoho_product_id.trim().length > 128) {
      return NextResponse.json({ error: "Zoho product ID must be 128 characters or fewer." }, { status: 400 });
    }

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
    const sizeCategory = typeof body.size_category === "string" && allowedSizeCategories.includes(body.size_category as (typeof allowedSizeCategories)[number])
      ? body.size_category as (typeof allowedSizeCategories)[number]
      : null;
    if (body.size_category !== undefined && body.size_category !== null && !sizeCategory) {
      return NextResponse.json({ error: "Choose a valid product size range." }, { status: 400 });
    }
    if (productType === "shoe" && (!sizeCategory || !shoeSizeCategories.includes(sizeCategory as (typeof shoeSizeCategories)[number]))) {
      return NextResponse.json({ error: "Choose a size range for the shoe." }, { status: 400 });
    }
    if (productType === "racquet" && sizeCategory) {
      return NextResponse.json({ error: "Racquets do not use size mappings." }, { status: 400 });
    }
    const isSizedProduct = isZohoSizeProduct(productType, sizeCategory);
    const sizeSkus = isSizedProduct && sizeCategory
      ? normalizeSizeSkus(body.zoho_size_skus, sizeOptionsByCategory[sizeCategory])
      : { values: isSizedProduct ? {} : undefined, error: undefined };
    if (sizeSkus.error) return NextResponse.json({ error: sizeSkus.error }, { status: 400 });
    if (isSizedProduct && !Object.values(sizeSkus.values ?? {}).some(Boolean)) {
      return NextResponse.json({ error: "Add a Zoho SKU to at least one size. Stock is managed by Zoho." }, { status: 400 });
    }
    if (!isSizedProduct && !normalizeSku(body.sku) && !normalizeZohoProductId(body.zoho_product_id)) {
      return NextResponse.json({ error: "Enter the exact Zoho SKU or item ID. Stock is managed by Zoho." }, { status: 400 });
    }
    const sizeSkuConflict = await ensureUniqueSizeSkus(supabase, sizeSkus.values ?? {});
    if (sizeSkuConflict) {
      if (sizeSkuConflict.code === "42703" || sizeSkuConflict.code === "PGRST204") {
        return NextResponse.json({ error: "Run SUPABASE_ZOHO_STOCK_RECONCILIATION_MIGRATION.sql before mapping shoe sizes to Zoho." }, { status: 503 });
      }
      if (sizeSkuConflict.code === "23505") return NextResponse.json({ error: sizeSkuConflict.message }, { status: 409 });
      return NextResponse.json({ error: "Unable to verify that each shoe-size Zoho SKU is unique." }, { status: 500 });
    }
    if (isSizedProduct && sizeCategory) {
      const validSizes = sizeOptionsByCategory[sizeCategory];
      if (sizes.values?.some((size) => !validSizes.includes(size))) {
        return NextResponse.json({ error: "One or more sizes do not match the selected size range." }, { status: 400 });
      }
    }

    if (!body.name?.trim() || !body.brand?.trim() || !body.category || !allowedCategories.includes(body.category)) {
      return NextResponse.json({ error: "Name, brand, and a valid category are required." }, { status: 400 });
    }
    const numericPrice = Number(body.price ?? 0);
    const storedSizeStock = isSizedProduct && sizeCategory
      ? Object.fromEntries(sizeOptionsByCategory[sizeCategory].map((size) => [size, 0]))
      : undefined;

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
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
        description: description.value ?? "",
        specifications: specifications.values ?? {},
        stock: 0,
        sku: isSizedProduct ? null : normalizeSku(body.sku),
        zoho_product_id: isSizedProduct ? null : normalizeZohoProductId(body.zoho_product_id),
        ...(isSizedProduct ? { zoho_size_skus: sizeSkus.values ?? {} } : {}),
        ...(isSizedProduct ? { zoho_size_item_ids: {} } : {}),
        ...(isSizedProduct ? { zoho_size_stock_synced_at: {} } : {}),
        is_active: body.is_active ?? true,
        colors: productType === "shoe" ? [] : colors.values ?? [],
        sizes: isSizedProduct && sizeCategory ? sizeOptionsByCategory[sizeCategory] : sizes.values ?? [],
        unavailable_sizes: isSizedProduct && storedSizeStock
          ? Object.keys(storedSizeStock)
          : unavailableSizes.values ?? [],
        ...(storedSizeStock ? { size_stock: storedSizeStock } : {}),
        product_type: productType,
        size_category: isSizedProduct ? sizeCategory : null,
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
      description?: unknown;
      specifications?: unknown;
    };

    const description = normalizeDescription(body.description);
    const specifications = normalizeSpecifications(body.specifications);
    if (description.error || specifications.error) {
      return NextResponse.json({ error: description.error || specifications.error }, { status: 400 });
    }
    if (!body.id) return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    const { data: existingProduct, error: existingProductError } = await supabase
      .from("products")
      .select("product_type, size_category, sku, zoho_product_id, zoho_stock_synced_at, zoho_size_skus, zoho_size_item_ids, zoho_size_stock_synced_at")
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
      return NextResponse.json({ error: "Choose a valid product size range." }, { status: 400 });
    }
    const productType = (body.product_type ?? existingProduct.product_type ?? "other") as (typeof allowedProductTypes)[number];
    const rawSizeCategory = body.size_category !== undefined ? body.size_category : existingProduct.size_category;
    const sizeCategory = typeof rawSizeCategory === "string" && allowedSizeCategories.includes(rawSizeCategory as (typeof allowedSizeCategories)[number])
      ? rawSizeCategory as (typeof allowedSizeCategories)[number]
      : null;
    if (productType === "shoe" && (!sizeCategory || !shoeSizeCategories.includes(sizeCategory as (typeof shoeSizeCategories)[number]))) {
      return NextResponse.json({ error: "Choose a size range for the shoe." }, { status: 400 });
    }
    if (productType === "racquet" && sizeCategory) {
      return NextResponse.json({ error: "Racquets do not use size mappings." }, { status: 400 });
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
    if (typeof body.sku === "string" && body.sku.trim().length > 128) {
      return NextResponse.json({ error: "SKU must be 128 characters or fewer." }, { status: 400 });
    }
    const isSizedProduct = isZohoSizeProduct(productType, sizeCategory);
    const effectiveSku = body.sku === undefined ? existingProduct.sku : body.sku;
    const effectiveZohoProductId = body.zoho_product_id === undefined ? existingProduct.zoho_product_id : body.zoho_product_id;
    if (!isSizedProduct && !normalizeSku(effectiveSku) && !normalizeZohoProductId(effectiveZohoProductId)) {
      return NextResponse.json({ error: "Enter the exact Zoho SKU or item ID. Stock is managed by Zoho." }, { status: 400 });
    }
    const sizeSkus = isSizedProduct && sizeCategory
      ? normalizeSizeSkus(body.zoho_size_skus, sizeOptionsByCategory[sizeCategory])
      : { values: undefined as Record<string, string> | undefined, error: undefined };
    if (sizeSkus.error) return NextResponse.json({ error: sizeSkus.error }, { status: 400 });
    const effectiveSizeSkus = sizeSkus.values ?? normalizeStringRecord(existingProduct.zoho_size_skus);
    if (isSizedProduct && !Object.values(effectiveSizeSkus).some((sku) => sku.trim())) {
      return NextResponse.json({ error: "Add a Zoho SKU to at least one size. Stock is managed by Zoho." }, { status: 400 });
    }
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
    if (isSizedProduct && sizeCategory && sizes.values?.some((size) => !sizeOptionsByCategory[sizeCategory].includes(size))) {
      return NextResponse.json({ error: "One or more sizes do not match the selected size range." }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (colors.values !== undefined) updatePayload.colors = isSizedProduct ? [] : colors.values;
    if (isSizedProduct && sizeCategory) {
      updatePayload.colors = [];
      updatePayload.sizes = sizeOptionsByCategory[sizeCategory];
      if (sizeSkus.values !== undefined) {
        updatePayload.unavailable_sizes = sizeOptionsByCategory[sizeCategory].filter((size) => !sizeSkus.values?.[size]);
      }
      if (changedSizeKeys.size > 0 || sizeCategory !== existingProduct.size_category) {
        updatePayload.unavailable_sizes = sizeOptionsByCategory[sizeCategory];
      }
    } else {
      if (sizes.values !== undefined) updatePayload.sizes = sizes.values;
      if (unavailableSizes.values !== undefined) updatePayload.unavailable_sizes = unavailableSizes.values;
    }
    if (body.product_type !== undefined) updatePayload.product_type = productType;
    if (body.size_category !== undefined || body.product_type !== undefined) updatePayload.size_category = isSizedProduct ? sizeCategory : null;
    if (isSizedProduct) {
      updatePayload.sku = null;
      updatePayload.zoho_product_id = null;
    } else if (body.product_type !== undefined) {
      updatePayload.zoho_size_skus = {};
      updatePayload.zoho_size_item_ids = {};
      updatePayload.zoho_size_stock_synced_at = {};
    }
    if (!isSizedProduct && (
      body.product_type !== undefined
      || (body.sku !== undefined && normalizeSku(body.sku) !== normalizeSku(existingProduct.sku))
      || (body.zoho_product_id !== undefined && normalizeZohoProductId(body.zoho_product_id) !== normalizeZohoProductId(existingProduct.zoho_product_id))
    )) updatePayload.zoho_stock_synced_at = null;
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
    if (isSizedProduct && sizeSkus.values !== undefined) {
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
    if (description.value !== undefined) updatePayload.description = description.value;
    if (specifications.values !== undefined) updatePayload.specifications = specifications.values;

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
