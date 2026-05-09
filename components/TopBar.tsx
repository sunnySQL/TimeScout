import Link from "next/link";

export function TopBar({
  showSearch = true,
  initialQuery = "",
  preserveParams = {},
  variant = "default",
  showLandingAnchors = true,
}: {
  showSearch?: boolean;
  initialQuery?: string;
  /**
   * Extra query params to carry through when the user submits a new search
   * from the top bar — used by `/search` so that typing a new query doesn't
   * wipe the brand, price, condition, and sold/stale/bundle toggles the
   * user has already set.
   */
  preserveParams?: Record<string, string | string[] | undefined>;
  /**
   * `home` — larger TimeScout wordmark + tagline (landing `/` and `/search`).
   * `default` everywhere else.
   */
  variant?: "default" | "home";
  /** Show landing-only in-page tabs (Live feed / How it works). */
  showLandingAnchors?: boolean;
}) {
  const largeBrand = variant === "home";

  return (
    <header
      className={`sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur-md ${
        largeBrand ? "shadow-sm" : ""
      }`}
    >
      <div
        className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-4"
      >
        {largeBrand ? (
          <Link
            href="/"
            className="group flex shrink-0 items-center leading-none"
            aria-label="TimeScout home"
          >
            <span className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              <span className="text-neutral-900 transition group-hover:text-accent">
                Time
              </span>
              <span className="text-accent transition group-hover:opacity-90">Scout</span>
            </span>
          </Link>
        ) : (
          <Link href="/" className="group flex shrink-0 items-center leading-none" aria-label="TimeScout home">
            <span className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              <span className="text-neutral-900 transition group-hover:text-accent">Time</span>
              <span className="text-accent transition group-hover:opacity-90">Scout</span>
            </span>
          </Link>
        )}

        {showSearch ? (
          <form
            action="/search"
            method="GET"
            className={`flex min-w-0 gap-2 ${largeBrand ? "w-full basis-full sm:flex-1 sm:basis-0" : "flex-1"}`}
          >
            <input
              key={`topbar-q-${initialQuery}`}
              name="q"
              defaultValue={initialQuery}
              placeholder="Search brand, model, or reference…"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-accent focus:ring-2 focus:ring-accent-ring"
            />
            {Object.entries(preserveParams).flatMap(([name, value]) => {
              if (value == null) return [];
              const values = Array.isArray(value) ? value : [value];
              return values
                .filter((v) => v !== "" && v != null)
                .map((v, i) => (
                  <input
                    key={`${name}-${i}`}
                    type="hidden"
                    name={name}
                    value={v}
                  />
                ));
            })}
            <button
              type="submit"
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Search
            </button>
          </form>
        ) : largeBrand ? (
          <div className="hidden flex-1 sm:block" aria-hidden />
        ) : (
          <div className="flex-1" />
        )}

        <nav className="flex items-center gap-3 sm:gap-4">
          {largeBrand && !showSearch && showLandingAnchors ? (
            <div
              role="navigation"
              aria-label="On this page"
              className="flex shrink-0 rounded-lg border border-neutral-200/90 bg-neutral-50 p-1 shadow-sm"
            >
              <Link
                href="/#live-feed"
                className="rounded-md px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-white hover:text-accent sm:px-3.5"
              >
                Live feed
              </Link>
              <Link
                href="/#how-it-works"
                className="rounded-md px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-white hover:text-accent sm:px-3.5"
              >
                How it works
              </Link>
            </div>
          ) : largeBrand && showSearch ? (
            <>
              <Link
                href="/"
                className="hidden text-sm font-medium text-neutral-600 hover:text-accent sm:inline"
              >
                Home
              </Link>
            </>
          ) : (
            <Link href="/search" className="text-sm font-medium text-neutral-600 hover:text-accent">
              Browse
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-neutral-200 bg-accent-softer">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="text-base font-semibold tracking-tight">
            <span className="text-neutral-900">Time</span>
            <span className="text-accent">Scout</span>
          </p>
          <p className="mt-2 max-w-sm text-neutral-600">
            A search utility for watch listings across the US web. We link you
            to the original listing — we don&rsquo;t hold inventory or verify
            sellers.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            Shop
          </p>
          <ul className="mt-3 space-y-2 text-neutral-700">
            <li>
              <Link href="/search" className="hover:text-accent hover:underline">
                All listings
              </Link>
            </li>
            <li>
              <Link href="/search?sort=newest" className="hover:text-accent hover:underline">
                Newest
              </Link>
            </li>
            <li>
              <Link href="/search?sort=price_asc" className="hover:text-accent hover:underline">
                Lowest price
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            About
          </p>
          <ul className="mt-3 space-y-2 text-neutral-700">
            <li>
              <Link href="/how-we-make-money" className="hover:text-accent hover:underline">
                How we make money
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-accent hover:underline">
                FAQ
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-accent hover:underline">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-accent hover:underline">
                About TimeScout
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-200">
        <div className="mx-auto max-w-7xl px-6 py-5 text-xs text-neutral-500">
          © {new Date().getFullYear()} TimeScout. All listings belong to their respective marketplaces.
        </div>
      </div>
    </footer>
  );
}
