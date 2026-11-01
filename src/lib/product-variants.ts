export const productTypes = ["shoe", "racquet", "other", "tshirt", "shorts", "socks"] as const;
export type ProductType = (typeof productTypes)[number];
export const shoeSizeCategories = ["mens", "womens", "kids"] as const;
export type ShoeSizeCategory = (typeof shoeSizeCategories)[number];

export const shoeSizes: Record<ShoeSizeCategory, string[]> = {
  mens: Array.from({ length: 14 }, (_, index) => `UK ${index + 2}`),
  womens: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
  kids: Array.from({ length: 10 }, (_, index) => `UK ${index + 2}`),
};

export const apparelSizes: Partial<Record<ProductType, string[]>> = {
  tshirt: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  shorts: ["S", "M", "L", "XL", "XLL"],
  socks: ["Small", "Medium", "Large"],
};

export function getProductSizes(productType: ProductType, shoeSizeCategory?: ShoeSizeCategory | null) {
  if (productType === "shoe") return shoeSizes[shoeSizeCategory ?? "mens"];
  return apparelSizes[productType] ?? [];
}

export function usesZohoSizeStock(productType: string | null | undefined) {
  return productType === "shoe" || productType === "tshirt" || productType === "shorts" || productType === "socks";
}
