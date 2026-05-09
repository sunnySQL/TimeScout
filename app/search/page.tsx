import Link from "next/link";
import { SearchTracker } from "@/components/AnalyticsTracker";
import { BrandFilter } from "@/components/BrandFilter";
import { FilterSection } from "@/components/FilterSection";
import { ListingCard } from "@/components/ListingCard";
import { PriceFilter } from "@/components/PriceFilter";
import { SortControl } from "@/components/SortControl";
import { SiteFooter, TopBar } from "@/components/TopBar";
import {
  DEFAULT_STALE_AFTER_DAYS,
  listBrands,
  normalizeBrandParam,
  searchListings,
  type SortKey,
} from "@/lib/search";

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseSort(value: string | undefined): SortKey {
  if (value === "price_asc" || value === "price_desc" || value === "newest") {
    return value;
  }
  return "relevance";
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const first = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const q = first("q")?.trim() || "";
  // Multi-select brand: URL may contain `?brand=Rolex&brand=Omega`, which
  // Next hands us as a string[]. Normalize into a deduped list.
  const selectedBrands = normalizeBrandParam(sp["brand"]);
  const state = first("state")?.toUpperCase() || "";
  const condition = first("condition") || "";
  const watchType = first("watchType") || "";
  const minPrice = parseNumber(first("minPrice"));
  const maxPrice = parseNumber(first("maxPrice"));
  const sort = parseSort(first("sort"));
  const includeStale = first("includeStale") === "1";
  const includeBundles = first("includeBundles") === "1";
  const includeSold = first("includeSold") === "1";
  const pageSize = 50;
  const page = Math.max(1, Math.floor(parseNumber(first("page")) ?? 1));

  const [{ rows, total }, brands] = await Promise.all([
    searchListings({
      q,
      brand: selectedBrands.length > 0 ? selectedBrands : undefined,
      state: state || undefined,
      condition: condition || undefined,
      watchType: watchType || undefined,
      minPrice,
      maxPrice,
      sort,
      includeStale,
      includeBundles,
      includeSold,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    listBrands({ includeStale, includeBundles, includeSold }),
  ]);

  const conditions = ["unworn", "excellent", "very good", "good", "fair"] as const;
  const watchTypes = ["vintage"] as const;
  const hasFilters = Boolean(
    q ||
      selectedBrands.length > 0 ||
      state ||
      condition ||
      watchType ||
      minPrice != null ||
      maxPrice != null ||
      includeStale ||
      includeBundles ||
      includeSold,
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const firstOnPage = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastOnPage = Math.min(safePage * pageSize, total);

  const buildPageHref = (target: number): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    for (const b of selectedBrands) params.append("brand", b);
    if (state) params.set("state", state);
    if (condition) params.set("condition", condition);
    if (watchType) params.set("watchType", watchType);
    if (minPrice != null) params.set("minPrice", String(minPrice));
    if (maxPrice != null) params.set("maxPrice", String(maxPrice));
    if (sort !== "relevance") params.set("sort", sort);
    if (includeStale) params.set("includeStale", "1");
    if (includeBundles) params.set("includeBundles", "1");
    if (includeSold) params.set("includeSold", "1");
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  };

  // Hand the TopBar search form everything *except* the query so typing a
  // new search term keeps the user's current brand/price/state/toggles.
  const preservedSearchParams: Record<string, string | string[] | undefined> = {
    brand: selectedBrands.length > 0 ? selectedBrands : undefined,
    state: state || undefined,
    condition: condition || undefined,
    watchType: watchType || undefined,
    minPrice: minPrice != null ? String(minPrice) : undefined,
    maxPrice: maxPrice != null ? String(maxPrice) : undefined,
    sort: sort !== "relevance" ? sort : undefined,
    includeStale: includeStale ? "1" : undefined,
    includeBundles: includeBundles ? "1" : undefined,
    includeSold: includeSold ? "1" : undefined,
  };

  const quickPickParams = new URLSearchParams();
  if (q) quickPickParams.set("q", q);
  const quickPicks = [
    { label: "Rolex", href: `/search?${new URLSearchParams([...quickPickParams, ["brand", "Rolex"]])}` },
    { label: "Omega", href: `/search?${new URLSearchParams([...quickPickParams, ["brand", "Omega"]])}` },
    {
      label: "Under $5k",
      href: `/search?${new URLSearchParams([...quickPickParams, ["maxPrice", "5000"]])}`,
    },
    {
      label: "Under $1k",
      href: `/search?${new URLSearchParams([...quickPickParams, ["maxPrice", "1000"]])}`,
    },
    {
      label: "Include sold",
      href: `/search?${new URLSearchParams([...quickPickParams, ["includeSold", "1"]])}`,
    },
  ];

  const searchFiltersMeta = {
    brands: selectedBrands,
    condition: condition || undefined,
    watchType: watchType || undefined,
    state: state || undefined,
    minPrice,
    maxPrice,
    includeStale,
    includeBundles,
    includeSold,
  };

  return (
    <div className="min-h-screen bg-[#faf9f7] text-neutral-900">
      <SearchTracker query={q} filters={searchFiltersMeta} />
      <TopBar
        variant="home"
        initialQuery={q}
        preserveParams={preservedSearchParams}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <aside className="no-scrollbar lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2">
          <FiltersForm
            q={q}
            selectedBrands={selectedBrands}
            condition={condition}
            watchType={watchType}
            state={state}
            minPrice={minPrice}
            maxPrice={maxPrice}
            sort={sort}
            includeStale={includeStale}
            includeBundles={includeBundles}
            includeSold={includeSold}
            brands={brands}
            conditions={[...conditions]}
            watchTypes={[...watchTypes]}
            hasFilters={hasFilters}
          />
        </aside>

        <section className="mt-6 lg:mt-0">
          <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-sm text-neutral-600">
                <span className="num font-semibold text-neutral-900">
                  {total.toLocaleString()}
                </span>{" "}
                active listing{total === 1 ? "" : "s"}
                {q && (
                  <>
                    {" "}
                    for <span className="text-neutral-900">&ldquo;{q}&rdquo;</span>
                  </>
                )}
                {total > 0 && (
                  <span className="num ml-2 text-neutral-500">
                    · showing {firstOnPage.toLocaleString()}–{lastOnPage.toLocaleString()}
                  </span>
                )}
              </h1>

              <SortControl
                sort={sort}
                preserveParams={{
                  q: q || undefined,
                  brand: selectedBrands.length > 0 ? selectedBrands : undefined,
                  state: state || undefined,
                  condition: condition || undefined,
                  watchType: watchType || undefined,
                  minPrice: minPrice != null ? String(minPrice) : undefined,
                  maxPrice: maxPrice != null ? String(maxPrice) : undefined,
                  includeStale: includeStale ? "1" : undefined,
                  includeBundles: includeBundles ? "1" : undefined,
                  includeSold: includeSold ? "1" : undefined,
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">Quick picks:</span>
              {quickPicks.map((pick) => (
                <Link
                  key={pick.label}
                  href={pick.href}
                  className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-accent hover:text-accent"
                >
                  {pick.label}
                </Link>
              ))}
            </div>

          </div>

          {rows.length === 0 ? (
            <EmptyState hasFilters={hasFilters} q={q} />
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((r) => (
                  <ListingCard key={r.id} row={r} placement="search" />
                ))}
              </ul>

              {totalPages > 1 && (
                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  buildHref={buildPageHref}
                />
              )}
            </>
          )}
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}

type FiltersFormProps = {
  q: string;
  selectedBrands: string[];
  condition: string;
  watchType: string;
  state: string;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sort: SortKey;
  includeStale: boolean;
  includeBundles: boolean;
  includeSold: boolean;
  brands: string[];
  conditions: string[];
  watchTypes: string[];
  hasFilters: boolean;
};

const CONDITION_HINTS: Record<string, string> = {
  unworn: "BNIB, LNIB, NOS, never worn, tags attached",
  excellent: "Mint, near mint, pristine, flawless, no scratches",
  "very good": "Excellent w/ minor marks, lightly worn, well kept",
  good: "Daily driver, some scratches, normal wear",
  fair: "Beater, project, needs service, heavy wear",
};

const WATCH_TYPE_HINTS: Record<string, string> = {
  vintage: "Pre-1980s era watch; can still be unworn or excellent",
};

function FiltersForm({
  q,
  selectedBrands,
  condition,
  watchType,
  state,
  minPrice,
  maxPrice,
  sort,
  includeStale,
  includeBundles,
  includeSold,
  brands,
  conditions,
  watchTypes,
  hasFilters,
}: FiltersFormProps) {
  const chipHref = (opts: {
    dropBrand?: string;
    dropCondition?: boolean;
    dropWatchType?: boolean;
    dropState?: boolean;
    dropPrice?: boolean;
    dropStale?: boolean;
    dropBundles?: boolean;
    dropSold?: boolean;
  }): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    for (const b of selectedBrands) {
      if (opts.dropBrand && b === opts.dropBrand) continue;
      params.append("brand", b);
    }
    if (!opts.dropCondition && condition) params.set("condition", condition);
    if (!opts.dropWatchType && watchType) params.set("watchType", watchType);
    if (!opts.dropState && state) params.set("state", state);
    if (!opts.dropPrice) {
      if (minPrice != null) params.set("minPrice", String(minPrice));
      if (maxPrice != null) params.set("maxPrice", String(maxPrice));
    }
    if (sort !== "relevance") params.set("sort", sort);
    if (!opts.dropStale && includeStale) params.set("includeStale", "1");
    if (!opts.dropBundles && includeBundles) params.set("includeBundles", "1");
    if (!opts.dropSold && includeSold) params.set("includeSold", "1");
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  };

  const activeFilters: Array<{ label: string; href: string }> = [];
  for (const b of selectedBrands) {
    activeFilters.push({ label: `Brand: ${b}`, href: chipHref({ dropBrand: b }) });
  }
  if (condition) {
    activeFilters.push({ label: `Condition: ${condition}`, href: chipHref({ dropCondition: true }) });
  }
  if (watchType) {
    activeFilters.push({ label: `Type: ${watchType}`, href: chipHref({ dropWatchType: true }) });
  }
  if (state) {
    activeFilters.push({ label: `State: ${state}`, href: chipHref({ dropState: true }) });
  }
  if (minPrice != null || maxPrice != null) {
    const minLabel = minPrice != null ? `$${minPrice.toLocaleString()}` : "Any";
    const maxLabel = maxPrice != null ? `$${maxPrice.toLocaleString()}` : "Any";
    activeFilters.push({ label: `Price: ${minLabel}-${maxLabel}`, href: chipHref({ dropPrice: true }) });
  }
  if (includeStale) activeFilters.push({ label: "Include stale", href: chipHref({ dropStale: true }) });
  if (includeBundles) {
    activeFilters.push({ label: "Include bundles", href: chipHref({ dropBundles: true }) });
  }
  if (includeSold) activeFilters.push({ label: "Include sold", href: chipHref({ dropSold: true }) });

  // React reuses uncontrolled inputs across renders when navigating between
  // URLs with different filter state; changing the `key` on each input that
  // we care about forces a DOM remount so `defaultChecked` / `defaultValue`
  // is honored. This is what makes "Clear all" actually reset checkboxes.
  const formKey = [
    q,
    selectedBrands.join(","),
    condition,
    watchType,
    state,
    minPrice ?? "",
    maxPrice ?? "",
    sort,
    includeStale ? 1 : 0,
    includeBundles ? 1 : 0,
    includeSold ? 1 : 0,
  ].join("|");

  return (
    <form
      method="GET"
      action="/search"
      className="py-2"
      key={formKey}
    >
      <input type="hidden" name="q" value={q} />
      {/* Carry sort through filter applies so the user's choice from the
          top-right sort control isn't wiped by clicking Apply filters. */}
      <input type="hidden" name="sort" value={sort} />

      <div className="flex flex-col gap-2 pb-4">
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          Apply filters
        </button>
        {hasFilters ? (
          <Link
            href="/search"
            className="rounded-md border border-neutral-300 px-4 py-2 text-center text-sm text-neutral-700 hover:border-accent hover:text-accent"
          >
            Clear all
          </Link>
        ) : (
          <span className="rounded-md border border-neutral-200 px-4 py-2 text-center text-sm text-neutral-400">
            No filters active
          </span>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <Link
              key={filter.label}
              href={filter.href}
              className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-medium text-accent transition hover:border-accent hover:bg-white"
            >
              {filter.label} <span className="ml-1" aria-hidden>×</span>
            </Link>
          ))}
        </div>
      )}

      <div className="divide-y divide-neutral-200 border-y border-neutral-200">
        <FilterSection
          id="brand"
          label="Brand"
          defaultOpen={selectedBrands.length > 0}
        >
          <BrandFilter brands={brands} selected={selectedBrands} />
        </FilterSection>

        <FilterSection
          id="price"
          label="Price (USD)"
          defaultOpen={minPrice != null || maxPrice != null}
        >
          <PriceFilter minPrice={minPrice} maxPrice={maxPrice} />
        </FilterSection>

        <FilterSection id="condition" label="Condition" defaultOpen={false}>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="radio"
                name="condition"
                value=""
                defaultChecked={!condition}
                className="accent-accent"
              />
              Any condition
            </label>
            {conditions.map((c) => (
              <label
                key={c}
                className="flex items-start gap-2 text-sm text-neutral-700"
              >
                <input
                  type="radio"
                  name="condition"
                  value={c}
                  defaultChecked={condition === c}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="capitalize">{c}</span>
                  <span className="block text-xs text-neutral-500">
                    {CONDITION_HINTS[c]}
                  </span>
                </span>
              </label>
            ))}
            <label className="flex items-start gap-2 text-sm text-neutral-700">
              <input
                type="radio"
                name="condition"
                value="n/a"
                defaultChecked={condition === "n/a"}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="text-neutral-500">Condition N/A</span>
                <span className="block text-xs text-neutral-500">
                  Listings where condition is unknown
                </span>
              </span>
            </label>
          </div>
        </FilterSection>

        <FilterSection id="watch-type" label="Watch type" defaultOpen={!!watchType}>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="radio"
                name="watchType"
                value=""
                defaultChecked={!watchType}
                className="accent-accent"
              />
              Any type
            </label>
            {watchTypes.map((t) => (
              <label
                key={t}
                className="flex items-start gap-2 text-sm text-neutral-700"
              >
                <input
                  type="radio"
                  name="watchType"
                  value={t}
                  defaultChecked={watchType === t}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="capitalize">{t}</span>
                  <span className="block text-xs text-neutral-500">
                    {WATCH_TYPE_HINTS[t]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </FilterSection>

        <FilterSection id="state" label="US state" defaultOpen={false}>
          <input
            name="state"
            defaultValue={state}
            maxLength={2}
            placeholder="e.g. CA"
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
          />
        </FilterSection>

        <FilterSection id="listing-type" label="Listing type" defaultOpen={false}>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="includeStale"
              value="1"
              defaultChecked={includeStale}
              className="mt-0.5 accent-accent"
            />
            <span>
              Include stale listings
              <span className="block text-xs text-neutral-500">
                Hidden by default; shows items not re-seen in{" "}
                {DEFAULT_STALE_AFTER_DAYS} days.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="includeBundles"
              value="1"
              defaultChecked={includeBundles}
              className="mt-0.5 accent-accent"
            />
            <span>
              Include bundle sales
              <span className="block text-xs text-neutral-500">
                Posts selling multiple watches at once. Hidden by default.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="includeSold"
              value="1"
              defaultChecked={includeSold}
              className="mt-0.5 accent-accent"
            />
            <span>
              Include recently sold
              <span className="block text-xs text-neutral-500">
                Last 24 hours only. Off by default.
              </span>
            </span>
          </label>
        </FilterSection>
      </div>
    </form>
  );
}


function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (target: number) => string;
}) {
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);

  const prevHref = buildHref(Math.max(1, page - 1));
  const nextHref = buildHref(Math.min(totalPages, page + 1));
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5"
    >
      <p className="num text-xs text-neutral-500">
        Page {page} of {totalPages}
      </p>

      <div className="flex items-center gap-1">
        {prevDisabled ? (
          <span className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300">
            ← Previous
          </span>
        ) : (
          <Link
            href={prevHref}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-accent hover:text-accent"
          >
            ← Previous
          </Link>
        )}

        <div className="hidden items-center gap-1 sm:flex">
          {windowStart > 1 && (
            <>
              <Link
                href={buildHref(1)}
                className="num rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-accent hover:text-accent"
              >
                1
              </Link>
              {windowStart > 2 && (
                <span className="px-1 text-xs text-neutral-400">…</span>
              )}
            </>
          )}
          {pages.map((p) =>
            p === page ? (
              <span
                key={p}
                aria-current="page"
                className="num rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={buildHref(p)}
                className="num rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-accent hover:text-accent"
              >
                {p}
              </Link>
            ),
          )}
          {windowEnd < totalPages && (
            <>
              {windowEnd < totalPages - 1 && (
                <span className="px-1 text-xs text-neutral-400">…</span>
              )}
              <Link
                href={buildHref(totalPages)}
                className="num rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-accent hover:text-accent"
              >
                {totalPages}
              </Link>
            </>
          )}
        </div>

        {nextDisabled ? (
          <span className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300">
            Next →
          </span>
        ) : (
          <Link
            href={nextHref}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-accent hover:text-accent"
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}

function EmptyState({ hasFilters, q }: { hasFilters: boolean; q: string }) {
  if (!hasFilters) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center shadow-sm">
        <p className="text-base font-semibold text-neutral-900">Nothing in the default index</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
          Either the database is empty, or nothing has been re-seen within the freshness window. Try{" "}
          <Link
            href="/search?includeStale=1"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            include stale listings
          </Link>
          , or run{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-neutral-800">npm run seed</code> /{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-neutral-800">npm run ingest:reddit</code>{" "}
          locally and reload.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center shadow-sm">
      <p className="text-base font-semibold text-neutral-900">No results</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-600">
        {q
          ? "Nothing matched your search and filters. Try a shorter query, widen the price range, or include stale listings."
          : "Nothing matched these filters. Try widening the price range or clearing a brand."}
      </p>
      <Link
        href="/search"
        className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
      >
        Clear filters
      </Link>
    </div>
  );
}
