import Link from "next/link";
import { SiteFooter, TopBar } from "@/components/TopBar";

export const metadata = {
  title: "FAQ",
  description: "Common questions about TimeScout search.",
};

export default function FaqPage() {
  const items = [
    {
      q: "Do you sell watches or check if a listing is real?",
      a: "No. We only search and link out. Anything you buy is between you and the marketplace or seller on the other end of the link.",
    },
    {
      q: "Why did a listing disappear?",
      a: "Usually because we haven’t seen it in a few days, it was marked sold, or it was filtered out. Try “Include stale” or adjust filters if you’re hunting something specific.",
    },
    {
      q: "Where does the data come from?",
      a: "Public sources we index — for example Reddit r/Watchexchange and other feeds we add over time. Each card shows the source name so you know where you’re going.",
    },
    {
      q: "Is this only the US?",
      a: "The product focus is US buyers for now. Some listings may mention other regions; always read the source listing for shipping and location.",
    },
  ];

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
              FAQ
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Common questions
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-neutral-700 sm:text-base">
              Short answers about what TimeScout does, what it doesn&apos;t do, and how to interpret the listings you see.
            </p>
          </div>
        </section>

        <ul className="mt-8 grid gap-4">
          {items.map((item) => (
            <li
              key={item.q}
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="text-base font-semibold text-neutral-900">{item.q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.a}</p>
            </li>
          ))}
        </ul>

        <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900">Still unsure?</h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            Use search first, then open the original listing for purchase details. Shipping, authenticity,
            payment terms, and seller policies always live on the source platform.
          </p>
        </section>

        <section className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/search"
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white transition hover:bg-accent-hover"
          >
            Open search
          </Link>
          <Link href="/about" className="font-semibold text-accent underline-offset-4 hover:underline">
            About TimeScout
          </Link>
          <Link href="/how-we-make-money" className="font-semibold text-accent underline-offset-4 hover:underline">
            How we make money
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
