import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";

const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Alloc", template: "%s · Alloc" },
  description: "Alloc watches your crypto position and decides whether to hold, move to a stablecoin, or move into an opportunity on Robinhood Chain.",
  metadataBase: new URL("https://alloc-two.vercel.app"),
  openGraph: { title: "Alloc", description: "Your capital. Three choices. One intelligent allocator.", type: "website", images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Alloc", description: "Your capital. Three choices. One intelligent allocator.", images: ["/brand/og-1200x630.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={schibsted.variable}>
      <body className="min-h-screen">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-[1000px] px-5 pb-24 pt-8 sm:pt-12">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
