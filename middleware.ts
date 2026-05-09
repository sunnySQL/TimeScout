import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type AttemptBucket = {
  count: number;
  resetAt: number;
  blockedUntil?: number;
};

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 30 * 60 * 1000; // 30 minutes

const buckets = new Map<string, AttemptBucket>();

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TimeScout Admin", charset="UTF-8"',
    },
  });
}

function tooManyResponse(retryAfterSec: number): NextResponse {
  return new NextResponse("Too many authentication attempts", {
    status: 429,
    headers: {
      "Retry-After": String(Math.max(1, retryAfterSec)),
    },
  });
}

function recordFailedAttempt(ip: string, now: number): AttemptBucket {
  const current = buckets.get(ip);
  let bucket: AttemptBucket;
  if (!current || now > current.resetAt) {
    bucket = { count: 1, resetAt: now + WINDOW_MS };
  } else {
    bucket = { ...current, count: current.count + 1 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    bucket.blockedUntil = now + BLOCK_MS;
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }
  buckets.set(ip, bucket);
  return bucket;
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();

  const user = process.env.ADMIN_BASIC_USER?.trim();
  const pass = process.env.ADMIN_BASIC_PASS?.trim();
  if (!user || !pass) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return unauthorizedResponse();
  }

  const now = Date.now();
  const ip = getClientIp(req);
  const bucket = buckets.get(ip);
  if (bucket?.blockedUntil && now < bucket.blockedUntil) {
    const retryAfterSec = Math.ceil((bucket.blockedUntil - now) / 1000);
    return tooManyResponse(retryAfterSec);
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    const updated = recordFailedAttempt(ip, now);
    if (updated.blockedUntil && now < updated.blockedUntil) {
      return tooManyResponse(Math.ceil((updated.blockedUntil - now) / 1000));
    }
    return unauthorizedResponse();
  }

  try {
    const decoded = atob(auth.slice(6));
    const [u, p] = decoded.split(":");
    if (u === user && p === pass) {
      buckets.delete(ip);
      return NextResponse.next();
    }
  } catch {
    // fall through
  }

  const updated = recordFailedAttempt(ip, now);
  if (updated.blockedUntil && now < updated.blockedUntil) {
    return tooManyResponse(Math.ceil((updated.blockedUntil - now) / 1000));
  }
  return unauthorizedResponse();
}

export const config = {
  matcher: ["/admin/:path*"],
};

