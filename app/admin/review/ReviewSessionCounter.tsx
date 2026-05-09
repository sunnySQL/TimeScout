"use client";

import { useEffect, useState } from "react";
import { adminBtnSecondaryClass } from "@/app/admin/_components";

export const REVIEW_SESSION_STORAGE_KEY = "timescout.review.sessionCount";
export const REVIEW_SAVED_EVENT = "timescout:review-saved";

function readStoredCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(REVIEW_SESSION_STORAGE_KEY);
  if (raw == null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function ReviewSessionCounter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(readStoredCount());

    const onSaved = () => {
      setCount((prev) => {
        const next = prev + 1;
        sessionStorage.setItem(REVIEW_SESSION_STORAGE_KEY, String(next));
        return next;
      });
    };

    window.addEventListener(REVIEW_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(REVIEW_SAVED_EVENT, onSaved);
  }, []);

  function handleReset() {
    sessionStorage.removeItem(REVIEW_SESSION_STORAGE_KEY);
    setCount(0);
  }

  return (
    <div className="flex flex-wrap items-center gap-3" aria-live="polite">
      <span className="text-stone-600 dark:text-stone-300">
        Session saves:{" "}
        <strong className="tabular-nums font-semibold text-stone-900 dark:text-stone-100">{count}</strong>
      </span>
      <button type="button" className={adminBtnSecondaryClass} onClick={handleReset}>
        Clear session count
      </button>
    </div>
  );
}
