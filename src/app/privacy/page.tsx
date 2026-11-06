import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Information | Al Raed Shop",
  description: "Privacy information about account, order and website analytics data used by the Al Raed Sports online shop.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-neutral-950 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-neutral-600">
          <Link href="/">Home</Link> / <span>Privacy</span>
        </nav>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Al Raed Shop</p>
        <h1 className="text-4xl font-semibold tracking-tight">Privacy information</h1>
        <p className="mt-6 leading-7 text-neutral-700">
          The shop processes information needed to manage customer accounts, orders and customer enquiries. Payment is handled through Stripe checkout. Google Analytics may be used to understand website visits and shopping activity.
        </p>
        <p className="mt-4 leading-7 text-neutral-700">
          Contact Al Raed Sports if you have a question about information associated with your account or order, or would like to make a privacy-related request. Do not send payment card details by email or WhatsApp.
        </p>
        <p className="mt-8 text-sm text-neutral-600">
          <Link className="underline underline-offset-4" href="/contact">Contact Al Raed Sports</Link>
          <span className="mx-3" aria-hidden="true">·</span>
          <Link className="underline underline-offset-4" href="/terms">Terms</Link>
        </p>
      </article>
    </main>
  );
}
