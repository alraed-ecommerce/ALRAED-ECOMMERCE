import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Al Raed Sports | UAE",
  description: "Learn about Al Raed Sports and our online store for badminton, tennis, squash and court sports equipment in the UAE.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-neutral-950 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-neutral-600">
          <Link href="/">Home</Link> / <span>About</span>
        </nav>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">About Al Raed Sports</p>
        <h1 className="text-4xl font-semibold tracking-tight">Made for the love of the game.</h1>
        <p className="mt-6 text-lg leading-8 text-neutral-700">
          Al Raed Sports is an online sports shop serving players in the United Arab Emirates. We offer equipment and essentials for badminton, tennis, squash and other court sports.
        </p>
        <p className="mt-4 leading-7 text-neutral-700">
          Explore the current catalog online, or contact our team for help choosing equipment and checking product details.
        </p>
        <div className="mt-8 flex flex-wrap gap-5 text-sm underline underline-offset-4">
          <Link href="/shop">Shop sports equipment</Link>
          <Link href="/prices">Browse current prices</Link>
          <Link href="/contact">Contact Al Raed Sports</Link>
        </div>
      </article>
    </main>
  );
}
