import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeToggle from "@/components/storefront/ThemeToggle";
import GoogleAnalytics from "@/components/storefront/GoogleAnalytics";
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
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("alraed-color-theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ThemeToggle />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
