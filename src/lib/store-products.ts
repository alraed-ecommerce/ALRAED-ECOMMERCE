export type StoreProduct = {
  id: number;
  productType: "shoe" | "racquet" | "other";
  sizeCategory: "mens" | "womens" | "kids" | null;
  name: string;
  brand: string;
  category: string;
  price: number;
  image: string;
  description: string;
  rating: number;
  reviews: number;
  stock: number;
  colors: string[];
  sizes: string[];
  unavailableSizes: string[];
  sizeStock: Record<string, number>;
};

export type CartLine = { product: StoreProduct; quantity: number; color?: string; size?: string };

export function isFootwearProduct(product: Pick<StoreProduct, "name"> & Partial<Pick<StoreProduct, "productType">>) {
  return product.productType === "shoe" || /shoe|sneaker/i.test(product.name);
}

export function hasProductOptions(product: Pick<StoreProduct, "name" | "colors" | "sizes"> & Partial<Pick<StoreProduct, "productType">>) {
  return product.colors.length > 0 || product.sizes.length > 0 || isFootwearProduct(product);
}

export function getCartLineKey(line: Pick<CartLine, "product" | "color" | "size">) {
  return JSON.stringify([line.product.id, line.color ?? null, line.size ?? null]);
}

export function mapStoreProduct(row: Record<string, unknown>): StoreProduct {
  const productType = row.product_type === "shoe" || row.product_type === "racquet" ? row.product_type : /shoe|sneaker/i.test(String(row.name ?? "")) ? "shoe" : /racket|racquet/i.test(String(row.name ?? "")) ? "racquet" : "other";
  const sizeStock = row.size_stock && typeof row.size_stock === "object" && !Array.isArray(row.size_stock)
    ? Object.fromEntries(Object.entries(row.size_stock).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0))
    : {};
  return {
    id: Number(row.id),
    productType,
    sizeCategory: row.size_category === "mens" || row.size_category === "womens" || row.size_category === "kids" ? row.size_category : null,
    name: String(row.name ?? ""),
    brand: String(row.brand ?? ""),
    category: String(row.category ?? ""),
    price: Number(row.price ?? 0),
    image: String(row.image_url ?? ""),
    description: String(row.description ?? ""),
    rating: Number(row.rating ?? 0),
    reviews: Number(row.reviews ?? 0),
    stock: productType === "shoe" ? Object.values(sizeStock).reduce((total, quantity) => total + quantity, 0) : Math.max(0, Number(row.stock ?? 0)),
    colors: productType === "shoe" ? [] : Array.isArray(row.colors) ? row.colors.filter((value): value is string => typeof value === "string") : [],
    sizes: Array.isArray(row.sizes) ? row.sizes.filter((value): value is string => typeof value === "string") : [],
    unavailableSizes: Array.isArray(row.unavailable_sizes) ? row.unavailable_sizes.filter((value): value is string => typeof value === "string") : [],
    sizeStock,
  };
}
