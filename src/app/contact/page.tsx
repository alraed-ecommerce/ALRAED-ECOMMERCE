import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Al Raed Sports | UAE",
  description: "Contact Al Raed Sports by email, phone or WhatsApp for product and order enquiries in the UAE.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-neutral-950 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-neutral-600">
          <Link href="/">Home</Link> / <span>Contact</span>
        </nav>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">We are here to help</p>
        <h1 className="text-4xl font-semibold tracking-tight">Contact Al Raed Sports</h1>
        <p className="mt-5 leading-7 text-neutral-700">
          Contact our team about products, orders or store information. For current delivery, returns and warranty details, please ask before placing an order.
        </p>
        <address className="mt-8 not-italic">
          <ul className="space-y-4">
            <li><span className="mr-2 font-medium">Store:</span>Madinat Zayed Shopping Centre, 2nd Floor, Al Danah, Abu Dhabi, UAE</li>
            <li><span className="mr-2 font-medium">Email:</span><a className="underline underline-offset-4" href="mailto:ecommerce.alraed@gmail.com">ecommerce.alraed@gmail.com</a></li>
            <li><span className="mr-2 font-medium">Phone:</span><a className="underline underline-offset-4" href="tel:+971504848236">+971 50 484 8236</a></li>
            <li><span className="mr-2 font-medium">WhatsApp:</span><a className="underline underline-offset-4" href="https://wa.me/971504848236" target="_blank" rel="noreferrer">Message Al Raed Sports</a></li>
            <li><span className="mr-2 font-medium">Service area:</span>United Arab Emirates</li>
          </ul>
        </address>
        <p className="mt-8 text-sm text-neutral-600">
          <Link className="underline underline-offset-4" href="/terms">Terms</Link>
          <span className="mx-3" aria-hidden="true">·</span>
          <Link className="underline underline-offset-4" href="/privacy">Privacy</Link>
        </p>
      </article>
    </main>
  );
}
