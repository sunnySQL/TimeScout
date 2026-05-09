"use client";

import { useEffect, useState } from "react";
import { adminBtnMutedClass, adminBtnPrimaryClass, adminSelectClass } from "@/app/admin/_components";

type Props = {
  filter: string;
  /** Active limit from the URL after navigation */
  currentLimit: number;
  /** Preserve active search when changing page size (omit hidden field when empty) */
  searchQuery: string;
};

export function ReviewLimitForm({ filter, currentLimit, searchQuery }: Props) {
  const [selected, setSelected] = useState(String(currentLimit));

  useEffect(() => {
    setSelected(String(currentLimit));
  }, [currentLimit]);

  const dirty = selected !== String(currentLimit);

  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="filter" value={filter} />
      <input type="hidden" name="page" value="1" />
      {searchQuery.trim() ? <input type="hidden" name="q" value={searchQuery.trim()} /> : null}
      <select
        name="limit"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className={`${adminSelectClass} min-w-[4.5rem] border-2 py-1 ${
          dirty
            ? "border-amber-500 ring-2 ring-amber-400/35 dark:border-amber-600 dark:ring-amber-500/25"
            : "border-stone-300 dark:border-stone-600"
        }`}
      >
        {[30, 60, 100, 150, 200].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!dirty}
        title={dirty ? "Apply new page size" : "Limit already matches the URL — pick another value to apply"}
        className={
          dirty
            ? `${adminBtnPrimaryClass} px-3 py-1 text-xs font-semibold ring-2 ring-stone-500 ring-offset-2 ring-offset-stone-50 hover:bg-stone-900 dark:ring-stone-400 dark:ring-offset-stone-900 dark:hover:bg-white`
            : `${adminBtnMutedClass} cursor-not-allowed px-3 py-1 text-xs font-medium opacity-55 grayscale-[0.2] dark:opacity-50`
        }
      >
        Apply limit
      </button>
    </form>
  );
}
