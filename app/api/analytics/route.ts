import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { analyticsEvents } from "@/db/schema";
import {
  getSessionId,
  hashIp,
  safeHeaders,
  safePath,
  safeQuery,
  safeMetadataJson,
  type AnalyticsEventType,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set<AnalyticsEventType>([
  "page_view",
  "search",
  "filter_apply",
]);

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { eventType, path, query, placement, metadata } = body as Record<
    string,
    unknown
  >;

  if (
    typeof eventType !== "string" ||
    !ALLOWED_EVENTS.has(eventType as AnalyticsEventType)
  ) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  const sessionId = getSessionId(req);
  const ipH = hashIp(req);
  const { userAgent, referer } = safeHeaders(req);

  const db = getDb();
  await db.insert(analyticsEvents).values({
    eventType,
    sessionId,
    ipHash: ipH,
    userAgent,
    referer,
    path: safePath(typeof path === "string" ? path : null),
    query: safeQuery(typeof query === "string" ? query : null),
    placement:
      typeof placement === "string" ? placement.slice(0, 32) : null,
    metadataJson: safeMetadataJson(
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : null,
    ),
  });

  return NextResponse.json({ ok: true });
}
