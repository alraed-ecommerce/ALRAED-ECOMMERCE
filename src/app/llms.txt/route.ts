const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";

export function GET() {
  const markdown = `# Al Raed Shop

> Al Raed Sports is an online sports shop serving players in the United Arab Emirates.

## Key pages
- [Home](${siteUrl}/): Storefront and featured sports equipment.
- [Shop](${siteUrl}/shop): Browse badminton, tennis, squash and court-sports products.
- [Prices](${siteUrl}/prices): Current product prices in AED, available without JavaScript.
- [About](${siteUrl}/about): About Al Raed Sports.
- [Contact](${siteUrl}/contact): Email, phone and WhatsApp contact details.
- [Terms](${siteUrl}/terms): Purchase and delivery information.
- [Privacy](${siteUrl}/privacy): Privacy information.
- [Sitemap](${siteUrl}/sitemap.xml): Public URL index.

## Contact
- Email: ecommerce.alraed@gmail.com
- Phone and WhatsApp: +971 50 484 8236
- Service area: United Arab Emirates

Product prices and availability may change. Check the shop or checkout for current order details.
`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
