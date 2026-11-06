import type { MetadataRoute } from "next";

const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";
const contentUpdatedAt = new Date("2026-11-06T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: contentUpdatedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/shop", siteUrl).toString(),
      lastModified: contentUpdatedAt,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...["/prices", "/about", "/contact", "/terms", "/privacy"].map((path) => ({
      url: new URL(path, siteUrl).toString(),
      lastModified: contentUpdatedAt,
      changeFrequency: "monthly" as const,
      priority: path === "/prices" ? 0.8 : 0.5,
    })),
  ];
}
