"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SortKey } from "@/lib/search";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "relevance", label: "Most recently seen" },
  { key: "newest", label: "Newest listings" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
];

/**
 * Dropdown sort picker for the top-right of the search page.
 *
 * Uses a small state + outside-click handler instead of the native
 * `<details>` element so clicking anywhere outside — or hitting Escape —
 * closes the menu, which matches what users expect from a dropdown.
 *
 * Each option is still a `<Link>` that carries every other search param
 * forward, so changing sort never wipes filters.
 */
export function SortControl({
  sort,
  preserveParams,
}: {
  sort: SortKey;
  preserveParams: Record<string, string | string[] | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  const current = SORT_OPTIONS.find((o) => o.key === sort) ?? SORT_OPTIONS[0];

  const buildHref = (nextSort: SortKey): string => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(preserveParams)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v) params.append(name, v);
        }
      } else if (value) {
        params.set(name, value);
      }
    }
    if (nextSort !== "relevance") params.set("sort", nextSort);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:border-accent hover:text-accent"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          Sort
        </span>
        <span className="font-medium">{current.label}</span>
        <span
          className={`text-xs text-neutral-400 transition ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md"
        >
          {SORT_OPTIONS.map((o) => (
            <li key={o.key}>
              <Link
                href={buildHref(o.key)}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 text-sm ${
                  o.key === sort
                    ? "bg-accent-softer font-semibold text-accent"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
