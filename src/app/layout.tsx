import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeToggle from "@/components/storefront/ThemeToggle";
import GoogleAnalytics from "@/components/storefront/GoogleAnalytics";
import WebMcpTools from "@/components/storefront/WebMcpTools";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SEO_SITE_URL ?? "https://alraedshop.com"),
  applicationName: "Al Raed Shop",
  title: "Al Raed Shop | Official Al Raed Sports Store in UAE",
  description: "Shop Al Raed Sports online in the UAE. Discover badminton, tennis, squash and court sports equipment, footwear and essentials.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Al Raed Sports",
    locale: "en_AE",
    title: "Al Raed Shop | Official Al Raed Sports Store in UAE",
    description: "Shop Al Raed Sports online in the UAE. Discover badminton, tennis, squash and court sports gear.",
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": ["Organization", "OnlineStore"],
                "@id": "https://alraedshop.com/#organization",
                name: "Al Raed Sports",
                url: "https://alraedshop.com/",
                logo: "https://alraedshop.com/icon.png",
                email: "ecommerce.alraed@gmail.com",
                telephone: "+971504848236",
                areaServed: {
                  "@type": "Country",
                  name: "United Arab Emirates",
                },
                sameAs: [
                  "https://www.facebook.com/alraedsports/",
                  "https://www.instagram.com/al_raed_sports/?hl=en",
                ],
                contactPoint: {
                  "@type": "ContactPoint",
                  contactType: "customer support",
                  email: "ecommerce.alraed@gmail.com",
                  telephone: "+971504848236",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "@id": "https://alraedshop.com/#website",
                url: "https://alraedshop.com/",
                name: "Al Raed Shop",
                publisher: { "@id": "https://alraedshop.com/#organization" },
                inLanguage: "en-AE",
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: "https://alraedshop.com/shop?q={search_term_string}",
                  },
                  "query-input": "required name=search_term_string",
                },
              },
            ]).replace(/</g, "\\u003c"),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("alraed-color-theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ThemeToggle />
        <GoogleAnalytics />
        <WebMcpTools />
      </body>
    </html>
  );
}
