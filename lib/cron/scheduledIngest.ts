import {
  ingestChrono24,
  type IngestChrono24Result,
} from "@/lib/ingest/chrono24";
import {
  ingestJomashopFromFile,
  ingestJomashopFromUrl,
} from "@/lib/ingest/jomashop";
import { ingestReddit } from "@/lib/ingest/reddit";

const DEFAULT_CHRONO_QUERIES = [
  "Rolex",
  "Omega",
  "Cartier",
  "TUDOR",
  "Grand Seiko",
];

export type Chrono24CronOutcome =
  | { skipped: true; reason: string }
  | IngestChrono24Result;

export type JomashopCronOutcome =
  | { skipped: true; reason: string }
  | Awaited<ReturnType<typeof ingestJomashopFromUrl>>;

export type ScheduledIngestResult = {
  reddit: Awaited<ReturnType<typeof ingestReddit>>;
  chrono24: Chrono24CronOutcome;
  jomashop: JomashopCronOutcome;
};

export type RunScheduledIngestOptions = {
  redditPages?: number;
  chrono24Pages?: number;
  /** Single query override (e.g. from cron URL). */
  chrono24Query?: string | null;
  /** When false, never run Jomashop (for tests or ?skipJomashop=1). */
  runJomashop?: boolean;
  /** When false, never run Chrono24 (e.g. ?skipChrono24=1). */
  runChrono24?: boolean;
};

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function chronoQueriesFromEnv(): string[] {
  const raw = process.env.CHRONO24_CRON_QUERIES?.trim();
  if (!raw) return [...DEFAULT_CHRONO_QUERIES];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [...DEFAULT_CHRONO_QUERIES];
}

/**
 * Rotates through `CHRONO24_CRON_QUERIES` on each 15-minute wall clock bucket
 * so consecutive cron runs hit different queries without storing state.
 */
export function pickChrono24Query(): string {
  const queries = chronoQueriesFromEnv();
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  return queries[bucket % queries.length]!;
}

function chrono24PagesFromEnv(): number {
  const raw = process.env.CHRONO24_CRON_PAGES?.trim();
  const n = raw ? Number(raw) : 1;
  return clampInt(n, 1, 3, 1);
}

/**
 * When `JOMASHOP_CRON_HOUR_UTC` is set (0–23), only run during that UTC hour
 * (first ~20 minutes) so large feeds are not pulled every 15 minutes.
 * When unset, run on every tick if Jomashop cron is enabled.
 */
function shouldRunJomashopCron(): boolean {
  const raw = process.env.JOMASHOP_CRON_HOUR_UTC?.trim();
  if (!raw) return true;
  const target = clampInt(Number(raw), 0, 23, 0);
  const d = new Date();
  return d.getUTCHours() === target && d.getUTCMinutes() < 20;
}

/**
 * One scheduled pass. Reddit is the active supported source. Chrono24 runs only
 * when `RETAILED_API_KEY` is set; Jomashop runs only when
 * `JOMASHOP_CRON_ENABLE=1` and a feed URL/path is configured. Those adapters
 * are experimental and off by default.
 *
 * Experimental adapter failures are caught and returned in the result so Reddit
 * work is not lost on partial failures.
 */
export async function runScheduledIngest(
  options: RunScheduledIngestOptions = {},
): Promise<ScheduledIngestResult> {
  const redditPages = clampInt(options.redditPages ?? 3, 1, 10, 3);
  const chrono24Pages = clampInt(
    options.chrono24Pages ?? chrono24PagesFromEnv(),
    1,
    3,
    1,
  );

  const reddit = await ingestReddit({
    pages: redditPages,
    fetchComments: false,
  });

  let chrono24: Chrono24CronOutcome;
  if (options.runChrono24 === false) {
    chrono24 = { skipped: true, reason: "skipped for this run" };
  } else {
    const apiKey = process.env.RETAILED_API_KEY?.trim();
    if (!apiKey) {
      chrono24 = { skipped: true, reason: "RETAILED_API_KEY not set" };
    } else {
      const query = options.chrono24Query?.trim() || pickChrono24Query();
      try {
        chrono24 = await ingestChrono24({
          apiKey,
          query,
          pages: chrono24Pages,
          pageSize: 30,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        chrono24 = { skipped: true, reason: `Chrono24 ingest failed: ${message}` };
      }
    }
  }

  let jomashop: JomashopCronOutcome;
  const runJomashop = options.runJomashop !== false;
  if (!runJomashop) {
    jomashop = { skipped: true, reason: "disabled for this run" };
  } else if (process.env.JOMASHOP_CRON_ENABLE !== "1") {
    jomashop = {
      skipped: true,
      reason: "set JOMASHOP_CRON_ENABLE=1 to run Jomashop on the schedule",
    };
  } else if (!shouldRunJomashopCron()) {
    jomashop = {
      skipped: true,
      reason: "outside JOMASHOP_CRON_HOUR_UTC window",
    };
  } else {
    const url = process.env.JOMASHOP_FEED_URL?.trim();
    const filePath = process.env.JOMASHOP_FEED_PATH?.trim();
    try {
      if (url) {
        jomashop = await ingestJomashopFromUrl({ url });
      } else if (filePath) {
        jomashop = await ingestJomashopFromFile({ filePath });
      } else {
        jomashop = {
          skipped: true,
          reason: "set JOMASHOP_FEED_URL or JOMASHOP_FEED_PATH",
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jomashop = { skipped: true, reason: `Jomashop ingest failed: ${message}` };
    }
  }

  return { reddit, chrono24, jomashop };
}
