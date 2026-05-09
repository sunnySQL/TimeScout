/**
 * Cron-triggered price rescue endpoint.
 *
 * Walks a bounded batch of recent Reddit listings that still have no price
 * and/or no parsed brand, then re-fetches the thread to read OP comments.
 * Slow — each call hits one Reddit comments page per candidate, paced to
 * avoid 429s.
 *
 * Run this on its own (slower) cron, e.g. every 30–60 minutes. Keep `limit`
 * low enough that a single invocation fits within your serverless timeout.
 *
 * Auth: same Bearer/secret scheme as the other cron routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { rescuePrices } from "../../../../lib/ingest/reddit";
import { authorizeCronRequest } from "../../../../lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Pro allows 300s; hobby caps at 60s. We stay conservative. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? "40"), 1, 150);
  const windowHours = clamp(
    Number(url.searchParams.get("windowHours") ?? "72"),
    1,
    168,
  );

  try {
    const result = await rescuePrices({ limit, windowHours });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
