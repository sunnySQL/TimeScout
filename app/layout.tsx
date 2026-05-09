import { Suspense } from "react";
import type { Metadata } from "next";
import { PageViewTracker } from "@/components/AnalyticsTracker";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TimeScout — US watch listing search",
    template: "%s · TimeScout",
  },
  description:
    "Search public watch listings in one place. Filter by brand, price, and condition — then open the original post or storefront.",
  openGraph: {
    title: "TimeScout",
    description:
      "US watch listing search across indexed sources. We link out; we don't sell or verify listings.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth motion-reduce:scroll-auto">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
