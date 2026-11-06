import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getPublicCatalogProducts } from "@/lib/server-catalog";

export const metadata: Metadata = {
  title: "Sports Equipment Prices in AED | Al Raed Shop",
  description: "Browse current Al Raed Sports product prices in UAE dirhams. Explore badminton, tennis, squash and court sports equipment.",
  alternates: { canonical: "/prices" },
};

const siteUrl = process.env.SEO_SITE_URL ?? "https://alraedshop.com";
const priceFormatter = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 2,
});

export default async function PricesPage() {
  await connection();
  const products = await getPublicCatalogProducts();
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Al Raed Sports product prices",
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: product.name,
        ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
        category: product.category,
        ...(product.description ? { description: product.description } : {}),
        ...(product.imageUrl ? { image: product.imageUrl } : {}),
        url: `${siteUrl}/prices#product-${product.id}`,
        offers: {
          "@type": "Offer",
          url: `${siteUrl}/prices#product-${product.id}`,
          priceCurrency: "AED",
          price: product.price.toFixed(2),
          seller: { "@id": `${siteUrl}/#organization` },
        },
      },
    })),
  };

  return (
    <main className="min-h-screen bg-white px-5 py-12 text-neutral-950 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-neutral-600">
          <Link href="/">Home</Link> / <span>Prices</span>
        </nav>
        <header className="mb-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Al Raed Sports · UAE</p>
          <h1 className="text-4xl font-semibold tracking-tight">Product prices</h1>
          <p className="mt-4 max-w-2xl text-neutral-600">
            Current catalog prices in AED, available in this page without JavaScript. Check the product page or checkout for current availability and order details.
          </p>
          <Link className="mt-6 inline-block underline underline-offset-4" href="/shop">Browse the interactive shop</Link>
        </header>

        {products.length === 0 ? (
          <p role="status" className="border-t border-neutral-200 py-6 text-neutral-600">
            No products are currently listed. Please check the shop again soon.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {products.map((product) => (
              <li id={`product-${product.id}`} key={product.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {product.brand && <p className="text-xs uppercase tracking-wider text-neutral-500">{product.brand}</p>}
                  <h2 className="mt-1 text-lg font-medium">{product.name}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{product.category}</p>
                </div>
                <p className="font-semibold">{priceFormatter.format(product.price)}</p>
              </li>
            ))}
          </ul>
        )}

        <nav aria-label="Store information" className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm underline underline-offset-4">
          <Link href="/about">About Al Raed Sports</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
