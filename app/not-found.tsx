import Link from "next/link";
import { SiteFooter, TopBar } from "@/components/TopBar";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#faf9f7] text-neutral-900">
      <TopBar showSearch variant="default" />
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          That URL isn&apos;t part of TimeScout. Try search, or head back home.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/search"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            Open search
          </Link>
          <Link
            href="/"
            className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-800 transition hover:border-accent hover:text-accent"
          >
            Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
