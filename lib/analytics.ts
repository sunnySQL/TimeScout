import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ts_sid";
const MAX_PATH = 512;
const MAX_QUERY = 1024;
const MAX_UA = 512;
const MAX_REFERER = 512;
const MAX_METADATA_JSON = 2048;

export type AnalyticsEventType =
  | "page_view"
  | "search"
  | "filter_apply"
  | "click";

export function getSessionId(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value?.slice(0, 64) ?? null;
}

export function hashIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip");
  if (!ip) return null;
  const salt = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

export function boundString(
  val: string | null | undefined,
  max: number,
): string | null {
  if (!val) return null;
  return val.slice(0, max);
}

export function safeHeaders(req: NextRequest) {
  return {
    userAgent: boundString(req.headers.get("user-agent"), MAX_UA),
    referer: boundString(req.headers.get("referer"), MAX_REFERER),
  };
}

export function safePath(val: string | null | undefined): string | null {
  return boundString(val, MAX_PATH);
}

export function safeQuery(val: string | null | undefined): string | null {
  return boundString(val, MAX_QUERY);
}

export function safeMetadataJson(
  obj: Record<string, unknown> | null | undefined,
): string | null {
  if (!obj) return null;
  const str = JSON.stringify(obj);
  if (str.length > MAX_METADATA_JSON) return null;
  return str;
}

export { SESSION_COOKIE };
