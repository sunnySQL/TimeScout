"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildReviewSearchQuery } from "@/lib/admin/reviewSearchUrl";
import { adminBtnMutedClass, adminBtnSecondaryClass } from "@/app/admin/_components";

const ADMIN_REVIEW_PATH = "/admin/review";
const DEBOUNCE_MS = 550;

type Props = {
  filter: string;
  limit: number;
  /** Trimmed query from the server / URL */
  initialQuery: string;
  placeholder: string;
};

export function ReviewLiveSearch({ filter, limit, initialQuery, placeholder }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current === document.activeElement) return;
    setDraft(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = draft.trim();
    const urlTrimmed = initialQuery.trim();
    if (trimmed === urlTrimmed) return;

    const id = window.setTimeout(() => {
      startTransition(() => {
        const qs = buildReviewSearchQuery({
          filter,
          page: 1,
          limit,
          q: trimmed || null,
        });
        router.replace(`${ADMIN_REVIEW_PATH}?${qs}`, { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [draft, filter, limit, initialQuery, router, startTransition]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    const qs = buildReviewSearchQuery({
      filter,
      page: 1,
      limit,
      q: trimmed || null,
    });
    startTransition(() => {
      router.push(`${ADMIN_REVIEW_PATH}?${qs}`, { scroll: false });
    });
  }

  function handleClear() {
    setDraft("");
    const qs = buildReviewSearchQuery({
      filter,
      page: 1,
      limit,
      q: null,
    });
    startTransition(() => {
      router.replace(`${ADMIN_REVIEW_PATH}?${qs}`, { scroll: false });
    });
  }

  const showClear = draft.trim().length > 0 || initialQuery.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="mt-auto flex min-w-0 flex-wrap items-end gap-2">
      <input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="Search listings"
        className="min-h-[2rem] min-w-0 flex-1 rounded-md border-2 border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-400/40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-400 sm:min-w-[10rem]"
      />
      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className={`${adminBtnSecondaryClass} shrink-0 px-3 py-1 text-xs font-semibold ring-1 ring-stone-300 ring-offset-1 ring-offset-white disabled:pointer-events-none disabled:opacity-60 dark:ring-stone-600 dark:ring-offset-stone-950`}
      >
        {isPending ? "Searching…" : "Search"}
      </button>
      {showClear ? (
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          className={`${adminBtnMutedClass} shrink-0 px-3 py-1 text-xs disabled:pointer-events-none disabled:opacity-60`}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
