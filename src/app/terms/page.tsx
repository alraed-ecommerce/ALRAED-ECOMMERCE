import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use | Al Raed Shop",
  description: "Terms and important purchasing information for using the Al Raed Sports online shop.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-neutral-950 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-neutral-600">
          <Link href="/">Home</Link> / <span>Terms</span>
        </nav>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Al Raed Shop</p>
        <h1 className="text-4xl font-semibold tracking-tight">Terms and purchase information</h1>
        <p className="mt-6 leading-7 text-neutral-700">
          Product prices are displayed in AED. Product details, price and availability can change; review the final order information shown at checkout before paying. An order is submitted through the checkout flow and its confirmation.
        </p>
        <p className="mt-4 leading-7 text-neutral-700">
          The shop currently advertises free delivery on orders over AED 200. Confirm delivery eligibility and any other applicable charges at checkout.
        </p>
        <p className="mt-4 leading-7 text-neutral-700">
          Delivery timing, returns, refunds and warranty terms depend on the details confirmed for the order. Contact Al Raed Sports before purchasing if you need those terms or clarification.
        </p>
        <p className="mt-8 text-sm text-neutral-600">
          Questions? <Link className="underline underline-offset-4" href="/contact">Contact Al Raed Sports</Link>.
        </p>
      </article>
    </main>
  );
}
