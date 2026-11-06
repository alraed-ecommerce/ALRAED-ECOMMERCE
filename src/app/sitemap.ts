import type { MetadataRoute } from "next";

const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/shop", siteUrl).toString(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}
