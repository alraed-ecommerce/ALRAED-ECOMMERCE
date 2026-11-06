const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";

export function GET() {
  const markdown = `# Al Raed Shop

Al Raed Sports is an online sports shop serving players in the United Arab Emirates.
Discover badminton, tennis, squash and court-sports equipment and essentials.

## Explore
- [Shop all products](${siteUrl}/shop)
- [Current product prices in AED](${siteUrl}/prices)
- [About Al Raed Sports](${siteUrl}/about)
- [Contact Al Raed Sports](${siteUrl}/contact)
- [Terms](${siteUrl}/terms)
- [Privacy](${siteUrl}/privacy)

## Contact
- Email: [ecommerce.alraed@gmail.com](mailto:ecommerce.alraed@gmail.com)
- Phone: [+971 50 484 8236](tel:+971504848236)
- WhatsApp: [Message Al Raed Sports](https://wa.me/971504848236)

Prices and product availability may change. Check the shop or checkout for current details.
`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
