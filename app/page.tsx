import Link from "next/link";
import { LiveStrip } from "@/components/LiveStrip";
import { ListingCard } from "@/components/ListingCard";
import { SiteFooter, TopBar } from "@/components/TopBar";
import { dominantSourceName } from "@/lib/listingSource";
import { searchListings, topBrands, totalListings } from "@/lib/search";

export const dynamic = "force-dynamic";

const POPULAR = [
  { q: "rolex submariner", label: "Rolex Submariner" },
  { q: "omega speedmaster", label: "Omega Speedmaster" },
  { q: "tudor black bay", label: "Tudor Black Bay" },
  { q: "grand seiko", label: "Grand Seiko" },
  { q: "patek nautilus", label: "Patek Nautilus" },
  { q: "audemars piguet royal oak", label: "Royal Oak" },
];

const PRICE_TILES = [
  { label: "Under $1k", blurb: "Entry & accessories", max: 1000 },
  { label: "$1k – $5k", blurb: "Sweet spot", min: 1000, max: 5000 },
  { label: "$5k – $15k", blurb: "Luxury daily", min: 5000, max: 15000 },
  { label: "$15k+", blurb: "Grail territory", min: 15000 },
];

export default async function Home() {
  const [total, brands, latest] = await Promise.all([
    totalListings(),
    topBrands(12),
    searchListings({ sort: "newest", limit: 8 }),
  ]);

  const listingSourceLabel = dominantSourceName(latest.rows);

  return (
    <div className="min-h-screen bg-[#faf9f7] text-neutral-900">
      <TopBar showSearch={false} variant="home" />

      <Hero total={total} />

      <LiveStrip total={total} sourceLabel={listingSourceLabel} />

      <ValueProps />

      <Section
        eyebrow="Browse"
        title="Shop by brand"
        subtitle="Top names on the index right now — tap to open search with that brand applied."
        action={{ href: "/search", label: "All brands" }}
        surface="paper"
      >
        {brands.length === 0 ? (
          <EmptyHint>
          No brands in the index yet. Run <code className="text-neutral-800">npm run seed</code> or
          ingest a source, then refresh.
        </EmptyHint>
        ) : (
          <ul className="mx-auto grid w-full max-w-5xl grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 lg:max-w-6xl">
            {brands.map((b) => (
              <li key={b.brand} className="w-full max-w-[11rem] md:max-w-none">
                <Link
                  href={{ pathname: "/search", query: { brand: b.brand } }}
                  className="group flex h-[5.5rem] flex-col items-center justify-center rounded-2xl border border-neutral-200/90 bg-white px-3 text-center shadow-sm ring-1 ring-black/[0.02] transition hover:-translate-y-1 hover:border-accent hover:shadow-lg hover:ring-accent/15"
                >
                  <span className="text-sm font-semibold text-neutral-900 group-hover:text-accent">
                    {b.brand}
                  </span>
                  <span className="num mt-1 text-[11px] text-neutral-500">
                    {b.count.toLocaleString()} active
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        eyebrow="Budget"
        title="Shop by price"
        subtitle="Preset ranges match the filters on search — same buckets, zero surprises."
        action={{ href: "/search", label: "Open search" }}
        surface="ink"
      >
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {PRICE_TILES.map((t) => (
            <li key={t.label}>
              <Link
                href={{
                  pathname: "/search",
                  query: {
                    ...(t.min != null ? { minPrice: String(t.min) } : {}),
                    ...(t.max != null ? { maxPrice: String(t.max) } : {}),
                  },
                }}
                className="flex h-full min-h-[7.5rem] flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.07] p-5 text-left text-white shadow-lg backdrop-blur-sm transition hover:bg-white/[0.12] hover:ring-2 hover:ring-[#8ecae6]/40"
              >
                <div>
                  <span className="num text-xl font-bold tracking-tight">{t.label}</span>
                  <p className="mt-1 text-xs font-medium text-white/55">{t.blurb}</p>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8ecae6]">
                  Search in TimeScout →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="live-feed"
        eyebrow="Live feed"
        eyebrowPrefix={listingSourceLabel}
        title={`Fresh from ${listingSourceLabel}`}
        subtitle="Newest picks from our last crawl — each card opens the original post."
        action={{ href: "/search?sort=newest", label: "See all" }}
        surface="paper"
      >
        {latest.rows.length === 0 ? (
          <EmptyHint>
            Nothing in the live feed yet. Run <code className="text-neutral-800">npm run seed</code>{" "}
            or <code className="text-neutral-800">npm run ingest:reddit</code>, then refresh.
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {latest.rows.map((r) => (
              <ListingCard key={r.id} row={r} placement="home" />
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="how-it-works"
        eyebrow="Product"
        title="How TimeScout works"
        subtitle="One product goal: less tab-hopping, more signal. We never replace the marketplace — we organize what is already public."
        surface="muted"
      >
        <ol className="grid gap-5 sm:grid-cols-3">
          <Step
            n={1}
            title="Search in one place"
            body="TimeScout fans out your query across the sources we index today, with more coming as the catalog grows."
          />
          <Step
            n={2}
            title="Filter like a buyer"
            body="Price, condition, state, bundles, sold — the grid stays honest about what you are comparing."
          />
          <Step
            n={3}
            title="Leave for the real listing"
            body="Click through to Reddit or the dealer site. TimeScout does not hold inventory or process checkout."
          />
        </ol>
      </Section>

      <SiteFooter />
    </div>
  );
}

function Hero({ total }: { total: number }) {
  return (
    <section className="relative overflow-hidden border-b border-neutral-200 bg-gradient-to-br from-accent via-[#0c3550] to-[#061f2e] text-white">
      {/* Original subtle plus-grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-6 py-16 text-center sm:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Watch search · United States
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl sm:leading-[1.08]">
          One place to{" "}
          <span className="text-[#8ecae6]">hunt US watch listings</span>{" "}
          without tab fatigue.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/80">
          TimeScout aggregates public listings into a fast, filterable grid. Start
          with enthusiast communities, expand to dealers and marketplaces as the
          index grows.
        </p>

        <form
          action="/search"
          method="GET"
          className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row"
        >
          <label className="sr-only" htmlFor="home-q">
            Search
          </label>
          <input
            id="home-q"
            name="q"
            placeholder="Search brand, model, or reference…"
            className="flex-1 rounded-lg border border-white/20 bg-white/95 px-4 py-3.5 text-base text-neutral-900 shadow-lg outline-none placeholder:text-neutral-500 focus:border-[#8ecae6] focus:ring-2 focus:ring-[#8ecae6]/40"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-lg bg-[#8ecae6] px-8 py-3.5 text-sm font-semibold tracking-wide text-[#0a1f2e] shadow-lg transition hover:bg-[#a8d8ea]"
          >
            Search
          </button>
        </form>

        <div className="mt-5 flex justify-center">
          <Link
            href="/search"
            className="text-sm font-medium text-white/90 underline-offset-4 hover:text-white hover:underline"
          >
            Browse all listings →
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm text-white/60">Popular:</span>
          {POPULAR.map((link) => (
            <Link
              key={link.q}
              href={{ pathname: "/search", query: { q: link.q } }}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white hover:text-accent"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-2xl sm:max-w-4xl">
          <div className="grid grid-cols-2 justify-items-center gap-x-8 gap-y-8 text-center sm:grid-cols-4 sm:gap-x-10">
            <Stat label="Active listings" value={total.toLocaleString()} light center />
            <Stat label="Currency" value="USD" light center />
            <Stat label="Region" value="US" light center />
            <Stat label="Focus" value="WTS" light center />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  light,
  center,
}: {
  label: string;
  value: string;
  light?: boolean;
  center?: boolean;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
          light ? "text-white/55" : "text-accent"
        }`}
      >
        {label}
      </p>
      <p
        className={`num mt-1 text-base font-semibold ${
          light ? "text-white" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ValueProps() {
  const items = [
    {
      title: "One search box",
      body: "TimeScout is the front door. Your query hits the whole index we maintain — not one forum tab at a time.",
    },
    {
      title: "Built for buyers",
      body: "Filters mirror how people actually shop: price bands, brand, condition, state, sold, bundles.",
    },
    {
      title: "Source-first",
      body: "We show where each listing lives. You always leave TimeScout for the real post or storefront.",
    },
  ];
  return (
    <section className="border-b border-neutral-200 bg-neutral-100/80 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          Why TimeScout
        </p>
        <h2 className="mx-auto mt-2 max-w-2xl text-center text-2xl font-semibold tracking-tight text-neutral-900">
          A calmer way to scan the US watch market
        </h2>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.title}
              className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                Why this exists
              </p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Section({
  id,
  eyebrow,
  /** When set, replaces the default “TimeScout · …” kicker (e.g. source name). */
  eyebrowPrefix,
  title,
  subtitle,
  action,
  children,
  surface,
}: {
  /** In-page anchor for nav (e.g. landing header). */
  id?: string;
  eyebrow: string;
  eyebrowPrefix?: string;
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  surface?: "paper" | "muted" | "ink";
}) {
  const surfaceClass =
    surface === "muted"
      ? "bg-neutral-100/90"
      : surface === "ink"
        ? "bg-gradient-to-b from-[#062536] to-[#04121c] text-white"
        : "bg-[#faf9f7]";
  const titleClass = surface === "ink" ? "text-white" : "text-neutral-900";
  const subtitleClass = surface === "ink" ? "text-white/65" : "text-neutral-600";
  const eyebrowClass = surface === "ink" ? "text-[#8ecae6]" : "text-accent";

  const kicker = eyebrowPrefix
    ? `${eyebrowPrefix} · ${eyebrow}`
    : `TimeScout · ${eyebrow}`;

  return (
    <section
      id={id}
      className={`${surfaceClass} border-b border-neutral-200 ${id ? "scroll-mt-28" : ""}`}
    >
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${eyebrowClass}`}>
              {kicker}
            </p>
            <h2 className={`mt-2 text-2xl font-semibold tracking-tight sm:text-3xl ${titleClass}`}>
              {title}
            </h2>
            {subtitle && (
              <p className={`mt-3 text-sm leading-relaxed sm:text-base ${subtitleClass}`}>{subtitle}</p>
            )}
          </div>
          {action && (
            <Link
              href={action.href}
              className={`shrink-0 text-sm font-bold transition ${
                surface === "ink"
                  ? "text-[#8ecae6] hover:text-white"
                  : "text-accent hover:underline"
              } underline-offset-4`}
            >
              {action.label} →
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-7 shadow-md">
      <div className="absolute left-0 top-0 h-full w-1.5 bg-accent" aria-hidden />
      <div className="flex items-start gap-4">
        <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-base font-bold text-accent">
          {n}
        </span>
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
        </div>
      </div>
    </li>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-sm text-neutral-600 shadow-sm">
      {children}
    </p>
  );
}
