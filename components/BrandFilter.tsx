"use client";

import { useMemo, useState } from "react";

const INITIAL_VISIBLE = 10;

/**
 * Searchable, multi-select brand picker for the filter sidebar.
 *
 * Each selected brand is carried through the parent form as its own hidden
 * `<input name="brand">`, which serializes on submit to
 * `?brand=Rolex&brand=Omega`. That's the same native-HTML contract forms
 * use for multi-selects, so no special server-side parsing is needed beyond
 * accepting an array value for the `brand` search param.
 *
 * By default only the first 10 brands are shown (alphabetical); a "See more"
 * toggle reveals the rest, and searching auto-expands so nothing is hidden
 * behind the fold. Any brand that's already selected but would be hidden in
 * the truncated view forces the list open so the user can always see and
 * deselect their current picks.
 */
export function BrandFilter({
  brands,
  selected: initialSelected,
}: {
  brands: string[];
  selected: string[];
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    Array.from(new Set(initialSelected.filter(Boolean))),
  );
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => {
    if (selected.length === 0) return false;
    // If any selected brand sits past the default window, start expanded so
    // the user can actually see and remove it without clicking "See more".
    return selected.some((pick) => {
      const idx = brands.findIndex(
        (b) => b.toLowerCase() === pick.toLowerCase(),
      );
      return idx >= INITIAL_VISIBLE;
    });
  });

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.toLowerCase().includes(q));
  }, [brands, query]);

  const isSearching = query.trim().length > 0;
  const canTruncate = !isSearching && filtered.length > INITIAL_VISIBLE;
  const visible = canTruncate && !expanded
    ? filtered.slice(0, INITIAL_VISIBLE)
    : filtered;
  const hiddenCount = filtered.length - visible.length;

  const toggleBrand = (brand: string) => {
    setSelected((prev) => {
      const key = brand.toLowerCase();
      const exists = prev.some((p) => p.toLowerCase() === key);
      if (exists) return prev.filter((p) => p.toLowerCase() !== key);
      return [...prev, brand];
    });
  };

  return (
    <div className="space-y-2">
      {/* One hidden input per selected brand — the form submits them as
          `?brand=a&brand=b` which Next.js hands us as a string[]. */}
      {selected.map((b) => (
        <input key={b} type="hidden" name="brand" value={b} />
      ))}

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search brands…"
          aria-label="Search brands"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 pr-8 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear brand search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-neutral-400 hover:text-neutral-700"
          >
            ✕
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {selected.map((b) => (
            <button
              key={`chip-${b}`}
              type="button"
              onClick={() => toggleBrand(b)}
              className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-softer px-2 py-0.5 text-xs font-medium text-accent transition hover:bg-accent hover:text-white"
              aria-label={`Remove ${b}`}
            >
              {b}
              <span aria-hidden="true" className="text-[10px]">✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-neutral-500 hover:text-accent hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="rounded-md border border-neutral-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-neutral-500">
            No brands match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          visible.map((b) => (
            <BrandRow
              key={b}
              label={b}
              active={selectedSet.has(b.toLowerCase())}
              onClick={() => toggleBrand(b)}
            />
          ))
        )}

        {canTruncate && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-center gap-1 border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent-softer"
          >
            {expanded ? (
              <>
                See less
                <span aria-hidden="true" className="text-[10px]">▴</span>
              </>
            ) : (
              <>
                See {hiddenCount} more
                <span aria-hidden="true" className="text-[10px]">▾</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function BrandRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={active}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
        active
          ? "bg-accent-softer font-semibold text-accent"
          : "text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
          active
            ? "border-accent bg-accent text-white"
            : "border-neutral-300 bg-white text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
