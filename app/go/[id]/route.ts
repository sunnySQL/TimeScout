import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { analyticsEvents, clicks, listings } from "@/db/schema";
import { getSessionId, safeHeaders } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * Outbound click tracker. Looks up the listing, fires a fire-and-forget
 * insert into `clicks`, then 302s to the original `listing_url`.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const listingId = Number(id);

  if (!Number.isFinite(listingId) || listingId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: listings.id,
      sourceId: listings.sourceId,
      listingUrl: listings.listingUrl,
    })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isSafeOutboundUrl(row.listingUrl)) {
    return NextResponse.json({ error: "Refusing to redirect" }, { status: 400 });
  }

  const placement = req.nextUrl.searchParams.get("p")?.slice(0, 32) ?? null;

  const ipH = hashIp(req);
  const { userAgent, referer } = safeHeaders(req);
  const sessionId = getSessionId(req);

  logClick({
    listingId: row.id,
    sourceId: row.sourceId,
    ipHash: ipH,
    userAgent,
    referer,
    placement,
  }).catch((err) => {
    console.error("Failed to log click", err);
  });

  logAnalyticsClick({
    listingId: row.id,
    sourceId: row.sourceId,
    sessionId,
    ipHash: ipH,
    userAgent,
    referer,
    placement,
  }).catch((err) => {
    console.error("Failed to log analytics click", err);
  });

  return NextResponse.redirect(row.listingUrl, 302);
}

type ClickInput = {
  listingId: number;
  sourceId: number;
  ipHash: string | null;
  userAgent: string | null;
  referer: string | null;
  placement: string | null;
};

async function logClick(input: ClickInput) {
  const db = getDb();
  await db.insert(clicks).values(input);
}

function isSafeOutboundUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hashIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : null;
  if (!ip) return null;
  const salt = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

type AnalyticsClickInput = {
  listingId: number;
  sourceId: number;
  sessionId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  referer: string | null;
  placement: string | null;
};

async function logAnalyticsClick(input: AnalyticsClickInput) {
  const db = getDb();
  await db.insert(analyticsEvents).values({
    eventType: "click",
    sessionId: input.sessionId,
    ipHash: input.ipHash,
    userAgent: input.userAgent,
    referer: input.referer,
    path: "/go",
    placement: input.placement,
    listingId: input.listingId,
    sourceId: input.sourceId,
  });
}
