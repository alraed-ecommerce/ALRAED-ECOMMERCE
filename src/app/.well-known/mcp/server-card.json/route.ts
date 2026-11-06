const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";

export function GET() {
  const card = {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "com.alraedshop/storefront",
    title: "Al Raed Shop",
    version: "1.0.0",
    description: "Read-only product search by name or category. No cart or checkout actions.",
    websiteUrl: siteUrl,
    icons: [{ src: `${siteUrl}/icon.png`, mimeType: "image/png" }],
    remotes: [{
      type: "streamable-http",
      url: `${siteUrl}/api/mcp`,
      supportedProtocolVersions: ["2025-03-26"],
    }],
  };

  return Response.json(card, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
