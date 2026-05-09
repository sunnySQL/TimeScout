/**
 * Chrono24 search via [Retailed](https://www.retailed.io/) — the public
 * chrono24.com HTML is behind Cloudflare challenges, so a normal server
 * fetch cannot scrape it reliably.
 *
 * Auth: dashboard API key in `x-api-key` (see Retailed authentication docs).
 */

const DEFAULT_BASE = "https://app.retailed.io/api/v1/scraper/chrono24/search";

export type RetailedChrono24Price = {
  amount: number;
  currency: string;
};

export type RetailedChrono24Item = {
  id: string;
  url: string;
  title: string;
  subtitle?: string;
  images?: string[];
  location?: string;
  price?: RetailedChrono24Price;
};

export type RetailedChrono24SearchResponse = {
  results?: RetailedChrono24Item[];
  pagination?: {
    current?: number;
    next?: number;
    has_next_page?: boolean;
  };
};

function buildSearchUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>,
): string {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export type FetchChrono24SearchPageOptions = {
  apiKey: string;
  /** Override default Retailed scraper URL (rare). */
  baseUrl?: string;
  query: string;
  page?: number;
  /** 30 | 60 | 120 per Retailed docs */
  pageSize?: number;
  currency?: string;
  language?: string;
  domain?: string;
};

export async function fetchChrono24SearchPage(
  opts: FetchChrono24SearchPageOptions,
): Promise<RetailedChrono24SearchResponse> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const url = buildSearchUrl(base, {
    query: opts.query,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 60,
    currency: opts.currency ?? "USD",
    language: opts.language ?? "en_US",
    domain: opts.domain ?? "com",
  });

  const res = await fetch(url, {
    headers: {
      "x-api-key": opts.apiKey,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Retailed Chrono24 search failed: HTTP ${res.status} — ${text.slice(0, 400)}`,
    );
  }

  try {
    return JSON.parse(text) as RetailedChrono24SearchResponse;
  } catch {
    throw new Error("Retailed Chrono24 search: response was not JSON");
  }
}
