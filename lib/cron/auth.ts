import { NextRequest } from "next/server";

/**
 * Check an incoming cron request against `CRON_SECRET`.
 *
 * Accepts either:
 *   - `Authorization: Bearer <secret>` (Vercel Cron sends this automatically
 *     when `CRON_SECRET` is set as an env var in the project).
 *   - `?secret=<secret>` query param (useful for curl / external schedulers
 *     that don't set custom headers).
 *
 * Returns `null` if the request is authorized, or an error string otherwise.
 */
export function authorizeCronRequest(req: NextRequest): string | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return "CRON_SECRET is not configured on the server";
  }

  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const headerSecret = match?.[1]?.trim();
  const querySecret = new URL(req.url).searchParams.get("secret");

  if (headerSecret === expected || querySecret === expected) {
    return null;
  }
  return "Unauthorized";
}
