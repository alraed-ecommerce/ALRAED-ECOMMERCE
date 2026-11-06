import type { Metadata } from "next";
import ShopClient from "./shop-client";

export const metadata: Metadata = {
  title: "Shop All Gear | Al Raed Sports",
  description: "Explore badminton, tennis, squash and court-side essentials at Al Raed Sports.",
  alternates: {
    canonical: "/shop",
  },
};

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;
  const requestedCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const requestedQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const initialCategory = ["Badminton", "Tennis", "Squash", "Pickleball", "Accessories"].includes(requestedCategory ?? "")
    ? requestedCategory ?? "All"
    : "All";

  return <ShopClient initialCategory={initialCategory} initialQuery={requestedQuery ?? ""} />;
}
