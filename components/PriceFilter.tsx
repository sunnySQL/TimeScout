"use client";

import { useMemo, useState } from "react";

type Preset = {
  id: string;
  label: string;
  min?: number;
  max?: number;
};

// Keep these in sync with the landing page's "Shop by price" tiles so
// selecting one on the homepage and then refining on search feels
// continuous.
const PRESETS: Preset[] = [
  { id: "under-1k", label: "Under $1k", max: 1000 },
  { id: "1k-5k", label: "$1k – $5k", min: 1000, max: 5000 },
  { id: "5k-15k", label: "$5k – $15k", min: 5000, max: 15000 },
  { id: "15k-plus", label: "$15k+", min: 15000 },
];

function normalize(value: string): number | undefined {
  if (value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function matchPreset(min: string, max: string): string | null {
  const mn = normalize(min);
  const mx = normalize(max);
  for (const p of PRESETS) {
    if (p.min === mn && p.max === mx) return p.id;
  }
  return null;
}

/**
 * Price filter with preset chips mirroring the homepage tiles plus the
 * existing free-form min/max inputs. Clicking a preset fills the inputs;
 * typing clears the preset highlight.
 */
export function PriceFilter({
  minPrice,
  maxPrice,
}: {
  minPrice?: number;
  maxPrice?: number;
}) {
  const [min, setMin] = useState(minPrice != null ? String(minPrice) : "");
  const [max, setMax] = useState(maxPrice != null ? String(maxPrice) : "");

  const active = useMemo(() => matchPreset(min, max), [min, max]);

  const applyPreset = (preset: Preset) => {
    if (active === preset.id) {
      setMin("");
      setMax("");
      return;
    }
    setMin(preset.min != null ? String(preset.min) : "");
    setMax(preset.max != null ? String(preset.max) : "");
  };

  const digitsOnly = (v: string) => v.replace(/[^\d]/g, "");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => {
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={isActive}
              className={`num rounded-md border px-3 py-2 text-sm transition ${
                isActive
                  ? "border-accent bg-accent-softer font-semibold text-accent"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-accent hover:text-accent"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          name="minPrice"
          value={min}
          onChange={(e) => setMin(digitsOnly(e.target.value))}
          inputMode="numeric"
          placeholder="Min"
          aria-label="Minimum price"
          className="num w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
        />
        <span className="text-neutral-400">–</span>
        <input
          name="maxPrice"
          value={max}
          onChange={(e) => setMax(digitsOnly(e.target.value))}
          inputMode="numeric"
          placeholder="Max"
          aria-label="Maximum price"
          className="num w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
        />
      </div>

      {(min || max) && (
        <button
          type="button"
          onClick={() => {
            setMin("");
            setMax("");
          }}
          className="text-xs text-accent hover:underline"
        >
          Clear price
        </button>
      )}
    </div>
  );
}
