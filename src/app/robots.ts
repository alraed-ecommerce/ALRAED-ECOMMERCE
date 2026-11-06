import type { MetadataRoute } from "next";

const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin-demo", "/account", "/checkout", "/api"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
