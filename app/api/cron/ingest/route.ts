/**
 * Scheduled multi-source ingestion (Vercel Cron or any Bearer/`?secret=` caller).
 *
 * Reddit is the active supported source. Chrono24/Jomashop are experimental
 * adapters and only run when their env vars are explicitly configured. Same
 * auth as other cron routes. Legacy path `/api/cron/ingest-reddit` still exists
 * and delegates here.
 */

import { NextRequest } from "next/server";
import { handleIngestCronRequest } from "@/lib/cron/ingestCronRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Large affiliate feeds can be slow to download and parse. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return handleIngestCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleIngestCronRequest(req);
}
