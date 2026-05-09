import Link from "next/link";
import { SiteFooter, TopBar } from "@/components/TopBar";

export const metadata = {
  title: "Contact",
  description: "How to reach TimeScout — and when to use the listing site instead.",
};

export default function ContactPage() {
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
              Contact
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Where to ask what
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-neutral-700 sm:text-base">
              TimeScout is a search layer. Questions about transactions belong on the original listing;
              feedback about the search experience belongs with the project.
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <InfoCard
            title="Listing questions"
            body="For price, negotiation, shipping, or authenticity, contact the seller on the source platform. We do not intermediate transactions."
          />
          <InfoCard
            title="TimeScout feedback"
            body="For parser misses, filter issues, stale data, or UI suggestions, use the maintainer channel you already use for this project."
          />
        </section>

        <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900">Before reaching out</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-600">
            <li>
              <strong className="font-semibold text-neutral-800">If a listing looks wrong:</strong> include the listing title and source so it can be re-parsed quickly.
            </li>
            <li>
              <strong className="font-semibold text-neutral-800">If search seems empty:</strong> check filters and freshness toggles first.
            </li>
            <li>
              <strong className="font-semibold text-neutral-800">If a post is gone:</strong> it may be sold, stale, or removed on the source.
            </li>
          </ul>
        </section>

        <section className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/search"
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white transition hover:bg-accent-hover"
          >
            Open search
          </Link>
          <Link href="/faq" className="font-semibold text-accent underline-offset-4 hover:underline">
            FAQ
          </Link>
          <span className="text-neutral-300">·</span>
          <Link href="/how-we-make-money" className="font-semibold text-accent underline-offset-4 hover:underline">
            How we make money
          </Link>
          <span className="text-neutral-300">·</span>
          <Link href="/about" className="font-semibold text-accent underline-offset-4 hover:underline">
            About TimeScout
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
