import { formatUsdRange, timeAgo } from "@/lib/format";
import { formatListingParseSubtitle } from "@/lib/listingDisplay";
import type { searchListings } from "@/lib/search";
import { ListingImage } from "@/components/ListingImage";
import { SourceBadge } from "@/components/SourceBadge";

export type ListingRow = Awaited<ReturnType<typeof searchListings>>["rows"][number];

export function ListingCard({ row: r, placement = "search" }: { row: ListingRow; placement?: string }) {
  const isFresh = Date.now() - new Date(r.lastSeenAt).getTime() < 24 * 60 * 60 * 1000;
  // When a min/max is set we have an approximate bucket (e.g. Reddit flair).
  // Render the range and show a muted "~ approx." label so users don't mistake
  // it for a precise asking price.
  const isApprox = r.priceMinCents != null || r.priceMaxCents != null;
  const isSold = r.isSold;
  const parseSubtitle = formatListingParseSubtitle(r);

  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition ${
        isSold
          ? "opacity-75 hover:opacity-100 hover:border-red-200"
          : "hover:border-accent hover:shadow-[0_1px_0_0_var(--color-accent-ring)]"
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-white">
        {r.imageUrl ? (
          <ListingImage
            src={r.imageUrl}
            alt={r.title}
            isSold={isSold}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-neutral-50 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              No photo
            </span>
            <span className="max-w-[90%] px-2 text-[11px] leading-snug text-neutral-500 line-clamp-2">
              Open the listing to see images on the source site.
            </span>
          </div>
        )}
        {isSold && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-white/30" />
            <span className="absolute left-3 top-3 rounded-sm bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
              Sold
            </span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-neutral-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-1">
            <SourceBadge slug={r.sourceSlug} />
            <span className="text-[11px] font-medium text-neutral-500">
              {r.sourceName}
            </span>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {r.watchType && (
              <span className="rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                {r.watchType}
              </span>
            )}
            {r.condition && r.condition !== "vintage" ? (
              <span className="rounded-sm border border-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
                {r.condition}
              </span>
            ) : (
              <span className="rounded-sm border border-dashed border-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                condition n/a
              </span>
            )}
          </div>
        </div>

        {parseSubtitle ? (
          <p className="line-clamp-2 text-xs text-neutral-500">{parseSubtitle}</p>
        ) : (
          <p className="text-xs text-neutral-400">
            Brand not identified <span className="text-neutral-300">·</span> see title
          </p>
        )}

        <h2
          className={`line-clamp-2 text-sm leading-snug ${
            isSold ? "text-neutral-500" : "text-neutral-800"
          }`}
        >
          {r.title}
        </h2>

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p
              className={`num text-xl font-semibold tracking-tight ${
                isSold ? "text-neutral-500 line-through" : "text-neutral-900"
              }`}
            >
              {formatUsdRange({
                exactCents: r.priceCents,
                minCents: r.priceMinCents,
                maxCents: r.priceMaxCents,
              })}
              {isApprox && !isSold && (
                <span className="ml-1.5 align-middle text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                  approx.
                </span>
              )}
            </p>
            <p className="text-xs text-neutral-500">
              {r.region ? `${r.region} · ` : ""}
              <span className={isFresh && !isSold ? "font-medium text-emerald-700" : ""}>
                seen {timeAgo(r.lastSeenAt)}
              </span>
            </p>
          </div>
          <a
            href={`/go/${r.id}?p=${placement}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition ${
              isSold
                ? "bg-neutral-400 hover:bg-neutral-500"
                : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {isSold ? "View post" : "View"}
          </a>
        </div>
      </div>
    </li>
  );
}
