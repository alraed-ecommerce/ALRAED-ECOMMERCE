import { createAdminSupabase } from "@/lib/server-auth";

export type PublicCatalogProduct = {
  id: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  imageUrl: string | null;
  description: string;
};

const publicCategories = ["Badminton", "Tennis", "Squash", "Accessories"];

export async function getPublicCatalogProducts(): Promise<PublicCatalogProduct[]> {
  const supabase = createAdminSupabase();
  if (!supabase) {
    throw new Error("The public product catalog is not configured.");
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand, category, price, image_url, description")
    .eq("is_active", true)
    .in("category", publicCategories)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load public product catalog:", error.message);
    throw new Error("Unable to load the public product catalog.");
  }

  return (data ?? []).map((product) => {
    const price = Number(product.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Product ${product.id} has an invalid public price.`);
    }

    return {
      id: Number(product.id),
      name: String(product.name ?? ""),
      brand: String(product.brand ?? ""),
      category: String(product.category ?? ""),
      price,
      imageUrl: typeof product.image_url === "string" && product.image_url.trim()
        ? product.image_url.trim()
        : null,
      description: String(product.description ?? ""),
    };
  });
}
