import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { runScheduledIngest } from "@/lib/cron/scheduledIngest";

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * Shared handler for `/api/cron/ingest` and legacy `/api/cron/ingest-reddit`.
 *
 * Query params:
 * - `pages` — Reddit listing pages (1–10, default 3)
 * - `chrono24Pages` — experimental Chrono24 adapter pages per run
 * - `chrono24Query` — force a single experimental Chrono24 query for this run
 * - `skipChrono24=1` — skip the experimental Chrono24 adapter
 * - `skipJomashop=1` — skip the experimental Jomashop/feed adapter
 */
export async function handleIngestCronRequest(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError }, { status: 401 });
  }

  const url = new URL(req.url);
  const redditPages = clampInt(Number(url.searchParams.get("pages") ?? "3"), 1, 10, 3);
  const chrono24Raw = url.searchParams.get("chrono24Pages");
  const chrono24PagesFinal =
    chrono24Raw != null && chrono24Raw !== ""
      ? clampInt(Number(chrono24Raw), 1, 3, 1)
      : undefined;
  const chrono24Query = url.searchParams.get("chrono24Query")?.trim() || undefined;
  const skipChrono24 = url.searchParams.get("skipChrono24") === "1";
  const skipJomashop = url.searchParams.get("skipJomashop") === "1";

  try {
    const result = await runScheduledIngest({
      redditPages,
      chrono24Pages: chrono24PagesFinal,
      chrono24Query,
      runChrono24: !skipChrono24,
      runJomashop: !skipJomashop,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
