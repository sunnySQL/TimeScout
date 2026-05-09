import Link from "next/link";
import { SiteFooter, TopBar } from "@/components/TopBar";

export const metadata = {
  title: "About",
  description: "What TimeScout is and how we treat listings.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7] text-neutral-900">
      <TopBar showSearch={false} variant="home" showLandingAnchors={false} />
      <article className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <section className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-white to-accent-softer p-8 shadow-sm transition duration-300 hover:shadow-md sm:p-10">
          <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-200/40 blur-3xl" />

          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              About TimeScout
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              One search box for watch listings.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-neutral-700 sm:text-base">
              TimeScout is a search utility for US watch listings. We index public posts and feeds
              into one fast grid so you can compare price, condition, freshness, and source without
              tab-hopping across marketplaces.
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <InfoCard
            title="What we do"
            body="We normalize listing data (brand, reference, price where possible) and let you filter quickly."
          />
          <InfoCard
            title="What we don’t do"
            body="We don’t sell watches, process checkout, or authenticate listings."
          />
          <InfoCard
            title="How to use it"
            body="Search by brand/model/reference, scan freshness, then click through to the original listing."
          />
        </section>

        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900">How the index works</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-600">
            <li>
              <strong className="font-semibold text-neutral-800">Freshness first:</strong> default search
              focuses on active rows seen recently, so stale posts don’t dominate.
            </li>
            <li>
              <strong className="font-semibold text-neutral-800">Sold handling:</strong> sold rows are
              hidden by default, with optional short-window visibility for recent sold context.
            </li>
            <li>
              <strong className="font-semibold text-neutral-800">Source transparency:</strong> every card
              shows where the listing lives; outbound links always open the original post/storefront.
            </li>
            <li>
              <strong className="font-semibold text-neutral-800">Best-effort parsing:</strong> brand,
              reference, and price are inferred from listing text and updated over time as parsing improves.
            </li>
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900">Why this exists</h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            Buying watches online usually means juggling multiple tabs, formats, and seller styles.
            TimeScout is meant to be the calm first pass: quickly shortlist listings, then evaluate the
            real post where the transaction actually happens.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            The product is intentionally utility-first. Less editorial, less hype, more signal.
          </p>
        </section>

        <section className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/search"
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white transition hover:bg-accent-hover"
          >
            Open search
          </Link>
          <Link href="/how-we-make-money" className="font-semibold text-accent underline-offset-4 hover:underline">
            How we make money
          </Link>
          <Link href="/faq" className="font-semibold text-accent underline-offset-4 hover:underline">
            FAQ
          </Link>
          <span className="text-neutral-300">·</span>
          <Link href="/contact" className="font-semibold text-accent underline-offset-4 hover:underline">
            Contact
          </Link>
        </section>
      </article>
      <SiteFooter />
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
    </div>
  );
}
