/**
 * @deprecated Use `/api/cron/ingest` in new configs. This route remains so
 * existing Vercel Cron URLs keep working — it runs the same scheduled ingest
 * (Reddit active path + optional experimental source adapters).
 */

import { NextRequest } from "next/server";
import { handleIngestCronRequest } from "@/lib/cron/ingestCronRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return handleIngestCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleIngestCronRequest(req);
}
