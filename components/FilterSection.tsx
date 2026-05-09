"use client";

import { useState } from "react";

/**
 * Collapsible search sidebar section. Open state is **not** persisted — each
 * full visit to `/search` starts from `defaultOpen` so leaving the page and
 * returning does not restore old expansions.
 */
export function FilterSection({
  id,
  label,
  defaultOpen = true,
  children,
}: {
  id: string;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id={id} className="border-b border-neutral-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-2 rounded-md px-1 py-4 text-left transition hover:bg-neutral-50"
      >
        <span className="text-sm font-semibold tracking-tight text-neutral-900 group-hover:text-accent">
          {label}
        </span>
        <span
          aria-hidden="true"
          className={`text-lg leading-none text-neutral-500 transition-transform group-hover:text-accent ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        >
          ▾
        </span>
      </button>
      <div
        className={`space-y-2 pb-4 ${open ? "block" : "hidden"}`}
        aria-hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}
