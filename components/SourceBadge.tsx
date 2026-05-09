/**
 * Small chip that identifies where a listing was ingested from.
 *
 * Renders a compact colored pill with a simplified platform mark + short
 * label, designed to sit above the human-readable source line on a card.
 * Safe to use for attribution (no trademarked assets embedded — just
 * generic geometry tinted with each platform's signature color).
 */

import type { SVGProps } from "react";

type SourceStyle = {
  label: string;
  color: string;
  Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
};

const SOURCES: Record<string, SourceStyle> = {
  "reddit-watchexchange": {
    label: "Reddit",
    color: "#FF4500",
    Icon: RedditIcon,
  },
  reddit: {
    label: "Reddit",
    color: "#FF4500",
    Icon: RedditIcon,
  },
  ebay: {
    label: "eBay",
    color: "#E53238",
    Icon: EbayIcon,
  },
  jomashop: {
    label: "Jomashop",
    color: "#0a2540",
    Icon: RetailIcon,
  },
  chrono24: {
    label: "Chrono24",
    color: "#006039",
    Icon: RetailIcon,
  },
  shopify: {
    label: "Shopify",
    color: "#008060",
    Icon: ShopifyIcon,
  },
};

const FALLBACK: SourceStyle = {
  label: "Source",
  color: "#525252",
  Icon: GenericIcon,
};

function styleFor(slug: string): SourceStyle {
  if (SOURCES[slug]) return SOURCES[slug];
  // Fuzzy match: "shopify-bobs-watches" should use the shopify style.
  for (const key of Object.keys(SOURCES)) {
    if (slug.startsWith(key)) return SOURCES[key];
  }
  return FALLBACK;
}

export function SourceBadge({
  slug,
  size = "sm",
}: {
  slug: string;
  size?: "sm" | "xs";
}) {
  const style = styleFor(slug);
  const Icon = style.Icon;
  const dims =
    size === "xs"
      ? "gap-1 px-1.5 py-0.5 text-[10px]"
      : "gap-1.5 px-2 py-0.5 text-[11px]";
  const iconSize = size === "xs" ? 10 : 12;

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-[0.08em] text-white ${dims}`}
      style={{ backgroundColor: style.color }}
    >
      <Icon width={iconSize} height={iconSize} aria-hidden="true" />
      {style.label}
    </span>
  );
}

/* ---------------------------- icons ---------------------------- */

function RedditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <circle cx="10" cy="11.5" r="6" />
      <circle cx="7.6" cy="10.6" r="1.1" fill="#fff" />
      <circle cx="12.4" cy="10.6" r="1.1" fill="#fff" />
      <path
        d="M7.4 13.2c.7.7 1.7 1.1 2.6 1.1s1.9-.4 2.6-1.1"
        stroke="#fff"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
      <line
        x1="10"
        y1="6"
        x2="13.2"
        y2="3.3"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <circle cx="13.7" cy="2.7" r="1.2" />
    </svg>
  );
}

function EbayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <text
        x="10"
        y="15"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="14"
        fontWeight="700"
        fontStyle="italic"
      >
        e
      </text>
    </svg>
  );
}

/** Simple storefront mark — used for gray-market retailers / marketplaces. */
function RetailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M3 7h14v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7zm2-3h10l1 3H4l1-3z" />
    </svg>
  );
}

function ShopifyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M13.5 5.5c0-1.1-.9-2-2-2s-2 .9-2 2v.3c-.6.1-1.1.3-1.5.5l-.3-.4c-.3-.3-.8-.3-1.1 0L4.4 8.1c-.2.2-.3.5-.2.8l2.6 7.4c.1.3.4.5.7.5h6.9c.3 0 .6-.2.7-.5l2.6-7.4c.1-.3 0-.6-.2-.8L15.3 6c-.3-.3-.7-.3-1 0l-.4.4c-.1-.4-.3-.7-.4-.9zM11.5 4.5c.3 0 .5.2.5.5v.2c-.3.1-.6.2-.9.3l-.1-.5c0-.3.2-.5.5-.5z" />
    </svg>
  );
}

function GenericIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <circle cx="10" cy="10" r="6" />
    </svg>
  );
}
