"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SESSION_COOKIE = "ts_sid";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function ensureSessionCookie(): string {
  const existing = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (existing) return existing.split("=")[1];

  const sid = crypto.randomUUID();
  document.cookie = `${SESSION_COOKIE}=${sid}; path=/; max-age=${SESSION_MAX_AGE}; SameSite=Lax`;
  return sid;
}

function sendEvent(
  eventType: string,
  data: Record<string, unknown> = {},
): void {
  const payload = { eventType, ...data };
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics",
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
  } else {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }
}

/**
 * Drop into the root layout — fires a `page_view` event on every
 * client-side navigation (pathname or query change).
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKey = useRef("");

  useEffect(() => {
    ensureSessionCookie();

    const qs = searchParams.toString();
    const key = `${pathname}?${qs}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    sendEvent("page_view", {
      path: pathname,
      query: qs || undefined,
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Fires a `search` event when the search page loads with a query or params.
 * Also fires `filter_apply` when filter params are present beyond just `q`.
 */
export function SearchTracker({
  query,
  filters,
}: {
  query: string;
  filters: Record<string, unknown>;
}) {
  const sentRef = useRef("");

  useEffect(() => {
    const key = JSON.stringify({ query, filters });
    if (sentRef.current === key) return;
    sentRef.current = key;

    if (query) {
      sendEvent("search", {
        path: "/search",
        query,
        metadata: { q: query },
      });
    }

    const hasFilters = Object.values(filters).some((v) =>
      Array.isArray(v) ? v.length > 0 : v != null && v !== "" && v !== false,
    );
    if (hasFilters) {
      sendEvent("filter_apply", {
        path: "/search",
        metadata: filters,
      });
    }
  }, [query, filters]);

  return null;
}
