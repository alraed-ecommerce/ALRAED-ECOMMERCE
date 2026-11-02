export const shoeSizeCategories = ["junior", "womens", "mens"] as const;

export type ShoeSizeCategory = (typeof shoeSizeCategories)[number];

export function isShoeSizeCategory(value: unknown): value is ShoeSizeCategory {
  return typeof value === "string" && shoeSizeCategories.some((category) => category === value);
}

export const shoeSizesByCategory: Record<ShoeSizeCategory, string[]> = {
  junior: Array.from({ length: 10 }, (_, index) => `EU ${index + 32}`),
  womens: Array.from({ length: 11 }, (_, index) => `EU ${index + 35}`),
  mens: Array.from({ length: 11 }, (_, index) => `EU ${index + 36}`),
};

export function getShoeSizes(category: ShoeSizeCategory) {
  return shoeSizesByCategory[category];
}
