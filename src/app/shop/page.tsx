import type { Metadata } from "next";
import ShopClient from "./shop-client";

export const metadata: Metadata = {
  title: "Shop Al Raed Sports | Official UAE Sports Store",
  description: "Shop Al Raed Sports online. Browse badminton, tennis, squash and court-side sports gear in the UAE.",
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
