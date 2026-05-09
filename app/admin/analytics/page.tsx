import { sql, eq, gte, desc, and } from "drizzle-orm";
import {
  AdminEmptyState,
  AdminHeader,
  AdminNav,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  AdminTable,
  SectionTitle,
  adminListCardClass,
  adminTdClass,
  adminThClass,
  adminTheadRowClass,
  adminTbodyRowClass,
} from "@/app/admin/_components";
import { getDb } from "@/db";
import { analyticsEvents, clicks, listings, sources } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    eventCounts7d,
    eventCounts24h,
    sessionStats,
    topSearchQueries,
    zeroResultSearches,
    searchesWithClicks,
    filterUsage,
    clicksBySource7d,
    clicksByPlacement7d,
    dailyFunnel,
    recentSessions,
  ] = await Promise.all([
    // Event counts by type (7d)
    db
      .select({
        eventType: analyticsEvents.eventType,
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, since7d))
      .groupBy(analyticsEvents.eventType),

    // Event counts by type (24h)
    db
      .select({
        eventType: analyticsEvents.eventType,
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, since24h))
      .groupBy(analyticsEvents.eventType),

    // Session-level stats (7d)
    db
      .select({
        totalSessions: sql<number>`COUNT(DISTINCT ${analyticsEvents.sessionId})`,
        searchSessions: sql<number>`COUNT(DISTINCT CASE WHEN ${analyticsEvents.eventType} = 'search' THEN ${analyticsEvents.sessionId} END)`,
        clickSessions: sql<number>`COUNT(DISTINCT CASE WHEN ${analyticsEvents.eventType} = 'click' THEN ${analyticsEvents.sessionId} END)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          sql`${analyticsEvents.sessionId} IS NOT NULL`,
        ),
      ),

    // Top search queries (7d) — extract `q` from metadata_json
    db
      .select({
        query: analyticsEvents.query,
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          eq(analyticsEvents.eventType, "search"),
          sql`${analyticsEvents.query} IS NOT NULL`,
          sql`${analyticsEvents.query} != ''`,
        ),
      )
      .groupBy(analyticsEvents.query)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(15),

    // Zero-result searches — searches not followed by a click in the same session
    // Approximation: search events from sessions that had 0 click events
    db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          eq(analyticsEvents.eventType, "search"),
          sql`${analyticsEvents.sessionId} NOT IN (
            SELECT DISTINCT ${analyticsEvents.sessionId}
            FROM ${analyticsEvents}
            WHERE ${analyticsEvents.eventType} = 'click'
              AND ${analyticsEvents.createdAt} >= ${since7d}
              AND ${analyticsEvents.sessionId} IS NOT NULL
          )`,
          sql`${analyticsEvents.sessionId} IS NOT NULL`,
        ),
      ),

    // Searches with at least one click in the same session
    db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          eq(analyticsEvents.eventType, "search"),
          sql`${analyticsEvents.sessionId} IN (
            SELECT DISTINCT ${analyticsEvents.sessionId}
            FROM ${analyticsEvents}
            WHERE ${analyticsEvents.eventType} = 'click'
              AND ${analyticsEvents.createdAt} >= ${since7d}
              AND ${analyticsEvents.sessionId} IS NOT NULL
          )`,
          sql`${analyticsEvents.sessionId} IS NOT NULL`,
        ),
      ),

    // Filter usage breakdown (7d) — aggregate metadata keys
    db
      .select({
        count: sql<number>`COUNT(*)`,
        withBrand: sql<number>`SUM(CASE WHEN JSON_LENGTH(JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.brands')) > 0 THEN 1 ELSE 0 END)`,
        withPrice: sql<number>`SUM(CASE WHEN JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.minPrice') IS NOT NULL OR JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.maxPrice') IS NOT NULL THEN 1 ELSE 0 END)`,
        withCondition: sql<number>`SUM(CASE WHEN JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.condition') IS NOT NULL THEN 1 ELSE 0 END)`,
        withState: sql<number>`SUM(CASE WHEN JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.state') IS NOT NULL THEN 1 ELSE 0 END)`,
        withSold: sql<number>`SUM(CASE WHEN JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.includeSold') = true THEN 1 ELSE 0 END)`,
        withStale: sql<number>`SUM(CASE WHEN JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.includeStale') = true THEN 1 ELSE 0 END)`,
        withBundles: sql<number>`SUM(CASE WHEN JSON_EXTRACT(${analyticsEvents.metadataJson}, '$.includeBundles') = true THEN 1 ELSE 0 END)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          eq(analyticsEvents.eventType, "filter_apply"),
        ),
      ),

    // Clicks by source (7d) from analytics_events
    db
      .select({
        sourceId: analyticsEvents.sourceId,
        name: sources.name,
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .innerJoin(sources, eq(sources.id, analyticsEvents.sourceId))
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          eq(analyticsEvents.eventType, "click"),
        ),
      )
      .groupBy(analyticsEvents.sourceId, sources.name)
      .orderBy(sql`COUNT(*) DESC`),

    // Clicks by placement (7d) from analytics_events
    db
      .select({
        placement: sql<string>`COALESCE(${analyticsEvents.placement}, 'unknown')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          eq(analyticsEvents.eventType, "click"),
        ),
      )
      .groupBy(sql`COALESCE(${analyticsEvents.placement}, 'unknown')`)
      .orderBy(sql`COUNT(*) DESC`),

    // Daily funnel (7d) — per-day counts by event type
    db
      .select({
        day: sql<string>`DATE(${analyticsEvents.createdAt})`,
        eventType: analyticsEvents.eventType,
        count: sql<number>`COUNT(*)`,
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, since7d))
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`, analyticsEvents.eventType)
      .orderBy(sql`DATE(${analyticsEvents.createdAt}) ASC`),

    // Recent sessions with activity summary (last 20)
    db
      .select({
        sessionId: analyticsEvents.sessionId,
        events: sql<number>`COUNT(*)`,
        searches: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventType} = 'search' THEN 1 ELSE 0 END)`,
        clicks: sql<number>`SUM(CASE WHEN ${analyticsEvents.eventType} = 'click' THEN 1 ELSE 0 END)`,
        firstSeen: sql<Date>`MIN(${analyticsEvents.createdAt})`,
        lastSeen: sql<Date>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, since7d),
          sql`${analyticsEvents.sessionId} IS NOT NULL`,
        ),
      )
      .groupBy(analyticsEvents.sessionId)
      .orderBy(sql`MAX(${analyticsEvents.createdAt}) DESC`)
      .limit(20),
  ]);

  // Derive KPI numbers
  const countByType = (
    rows: { eventType: string; count: number }[],
    type: string,
  ) => Number(rows.find((r) => r.eventType === type)?.count ?? 0);

  const pageViews7d = countByType(eventCounts7d, "page_view");
  const searches7d = countByType(eventCounts7d, "search");
  const filterApplies7d = countByType(eventCounts7d, "filter_apply");
  const analyticsClicks7d = countByType(eventCounts7d, "click");

  const pageViews24h = countByType(eventCounts24h, "page_view");
  const searches24h = countByType(eventCounts24h, "search");
  const analyticsClicks24h = countByType(eventCounts24h, "click");

  const sessions = sessionStats[0];
  const totalSessions = Number(sessions?.totalSessions ?? 0);
  const searchSessions = Number(sessions?.searchSessions ?? 0);
  const clickSessions = Number(sessions?.clickSessions ?? 0);
  const searchesPerSession =
    totalSessions > 0 ? (searches7d / totalSessions).toFixed(1) : "0";
  const searchToClickRate =
    searches7d > 0
      ? Math.round((analyticsClicks7d / searches7d) * 100)
      : 0;

  const totalSearches7d = searches7d;
  const zeroResultCount = Number(zeroResultSearches[0]?.count ?? 0);
  const searchesWithClickCount = Number(searchesWithClicks[0]?.count ?? 0);
  const searchClickThroughRate =
    totalSearches7d > 0
      ? Math.round((searchesWithClickCount / totalSearches7d) * 100)
      : 0;

  const fu = filterUsage[0];
  const totalFilterApplies = Number(fu?.count ?? 0);
  const filterBreakdown = [
    { label: "Brand", count: Number(fu?.withBrand ?? 0) },
    { label: "Price range", count: Number(fu?.withPrice ?? 0) },
    { label: "Condition", count: Number(fu?.withCondition ?? 0) },
    { label: "US state", count: Number(fu?.withState ?? 0) },
    { label: "Include sold", count: Number(fu?.withSold ?? 0) },
    { label: "Include stale", count: Number(fu?.withStale ?? 0) },
    { label: "Include bundles", count: Number(fu?.withBundles ?? 0) },
  ];

  // Build daily funnel data
  const daysSet = new Set<string>();
  for (const r of dailyFunnel) daysSet.add(r.day);
  const days = [...daysSet].sort();
  const dailyData = days.map((day) => {
    const dayRows = dailyFunnel.filter((r) => r.day === day);
    return {
      day,
      pageViews: countByType(dayRows, "page_view"),
      searches: countByType(dayRows, "search"),
      clicks: countByType(dayRows, "click"),
    };
  });
  const maxDailyPV = Math.max(1, ...dailyData.map((d) => d.pageViews));

  const totalAnalyticsClicks7d = analyticsClicks7d;

  return (
    <AdminShell>
      <AdminHeader title="Analytics" />
      <AdminNav active="analytics" />

      {/* ── Funnel KPIs ────────────────────────────────────── */}
      <SectionTitle>Funnel (7 days)</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        High-level conversion from page views through searches to outbound clicks.
      </p>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <AdminStatCard label="Page views" value={pageViews7d.toLocaleString()} detail="7d total" />
        <AdminStatCard label="Searches" value={searches7d.toLocaleString()} detail="7d total" />
        <AdminStatCard label="Filter applies" value={filterApplies7d.toLocaleString()} detail="7d total" />
        <AdminStatCard label="Clicks" value={analyticsClicks7d.toLocaleString()} detail="outbound 7d" />
        <AdminStatCard label="Search → Click" value={`${searchToClickRate}%`} detail="conversion rate" />
        <AdminStatCard
          label="Sessions"
          value={totalSessions.toLocaleString()}
          detail={`${searchesPerSession} searches/session`}
        />
      </div>

      {/* 24h snapshot */}
      <SectionTitle>24-hour snapshot</SectionTitle>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <AdminStatCard label="Page views" value={pageViews24h.toLocaleString()} detail="last 24h" />
        <AdminStatCard label="Searches" value={searches24h.toLocaleString()} detail="last 24h" />
        <AdminStatCard label="Clicks" value={analyticsClicks24h.toLocaleString()} detail="last 24h" />
        <AdminStatCard
          label="Click sessions"
          value={clickSessions.toLocaleString()}
          detail={`of ${totalSessions} sessions (7d)`}
        />
      </div>

      {/* ── Daily funnel chart ──────────────────────────────── */}
      <SectionTitle>Daily funnel trend</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        Stacked bars show page views, searches, and clicks per day. Taller bars = more activity.
      </p>
      {dailyData.length === 0 ? (
        <AdminEmptyState>No daily data yet.</AdminEmptyState>
      ) : (
        <AdminPanel className="mb-8 overflow-x-auto">
          <div className="flex items-end gap-2" style={{ minHeight: 140 }}>
            {dailyData.map((d) => {
              const pvH = Math.max(4, (d.pageViews / maxDailyPV) * 120);
              const sH = Math.max(0, (d.searches / maxDailyPV) * 120);
              const cH = Math.max(0, (d.clicks / maxDailyPV) * 120);
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex flex-col items-center" style={{ height: pvH }}>
                    <div
                      className="w-6 rounded-t bg-stone-200 dark:bg-stone-700"
                      style={{ height: pvH }}
                      title={`${d.pageViews} page views`}
                    />
                  </div>
                  <div
                    className="w-6 bg-blue-300 dark:bg-blue-600"
                    style={{ height: sH }}
                    title={`${d.searches} searches`}
                  />
                  <div
                    className="w-6 rounded-b bg-emerald-400 dark:bg-emerald-600"
                    style={{ height: cH }}
                    title={`${d.clicks} clicks`}
                  />
                  <span className="mt-1 text-[10px] text-stone-500">
                    {new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[10px] text-stone-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-stone-200 dark:bg-stone-700" />
              Page views
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-blue-300 dark:bg-blue-600" />
              Searches
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
              Clicks
            </span>
          </div>
        </AdminPanel>
      )}

      {/* ── Search usefulness ─────────────────────────────── */}
      <SectionTitle>Search usefulness</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        How often searches lead to outbound clicks. Zero-result sessions searched but never clicked.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <AdminStatCard label="Total searches" value={totalSearches7d.toLocaleString()} detail="7d" />
        <AdminStatCard
          label="With clicks"
          value={searchesWithClickCount.toLocaleString()}
          detail={`${searchClickThroughRate}% click-through`}
        />
        <AdminStatCard
          label="Without clicks"
          value={zeroResultCount.toLocaleString()}
          detail="sessions with search but no click"
        />
        <AdminStatCard
          label="Search sessions"
          value={searchSessions.toLocaleString()}
          detail={`of ${totalSessions} total`}
        />
      </div>

      <div className="mb-8">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Top queries (7d)
        </h3>
        {topSearchQueries.length === 0 ? (
          <AdminEmptyState>No search queries recorded yet.</AdminEmptyState>
        ) : (
          <ul className={adminListCardClass}>
            {topSearchQueries.map((q, i) => (
              <li
                key={`${q.query}-${i}`}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
              >
                <span className="truncate text-stone-800 dark:text-stone-100">
                  {q.query}
                </span>
                <span className="font-mono text-stone-500 dark:text-stone-400">
                  {Number(q.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Filter usage ─────────────────────────────────── */}
      <SectionTitle>Filter usage (7d)</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        How often each filter type is applied. Helps decide which filters deserve more UI prominence.
      </p>
      {totalFilterApplies === 0 ? (
        <div className="mb-8">
          <AdminEmptyState>No filter_apply events yet.</AdminEmptyState>
        </div>
      ) : (
        <AdminPanel className="mb-8">
          <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
            Out of <strong>{totalFilterApplies}</strong> filter applies:
          </p>
          <ul className="space-y-2">
            {filterBreakdown.map((f) => {
              const pct =
                totalFilterApplies > 0
                  ? Math.round((f.count / totalFilterApplies) * 100)
                  : 0;
              return (
                <li key={f.label} className="flex items-center gap-3 text-sm">
                  <span className="w-28 text-stone-700 dark:text-stone-200">
                    {f.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      className="h-full rounded-full bg-blue-400 dark:bg-blue-500"
                      style={{ width: `${Math.max(1, pct)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-mono text-xs text-stone-500">
                    {f.count} ({pct}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </AdminPanel>
      )}

      {/* ── Source performance ────────────────────────────── */}
      <SectionTitle>Source performance (7d)</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        Outbound clicks by source and placement, from the analytics_events table.
      </p>
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Clicks by source
          </h3>
          {clicksBySource7d.length === 0 ? (
            <AdminEmptyState>No click events yet.</AdminEmptyState>
          ) : (
            <ul className={adminListCardClass}>
              {clicksBySource7d.map((s) => {
                const count = Number(s.count);
                const share =
                  totalAnalyticsClicks7d > 0
                    ? Math.round((count / totalAnalyticsClicks7d) * 100)
                    : 0;
                return (
                  <li
                    key={s.sourceId}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-stone-800 dark:text-stone-100">
                        {s.name}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {share}% of clicks
                      </p>
                    </div>
                    <span className="font-mono text-stone-500 dark:text-stone-400">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Clicks by placement
          </h3>
          {clicksByPlacement7d.length === 0 ? (
            <AdminEmptyState>No placement data yet.</AdminEmptyState>
          ) : (
            <ul className={adminListCardClass}>
              {clicksByPlacement7d.map((p) => {
                const count = Number(p.count);
                const share =
                  totalAnalyticsClicks7d > 0
                    ? Math.round((count / totalAnalyticsClicks7d) * 100)
                    : 0;
                return (
                  <li
                    key={p.placement}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-stone-800 dark:text-stone-100">
                        {p.placement}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {share}% of clicks
                      </p>
                    </div>
                    <span className="font-mono text-stone-500 dark:text-stone-400">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Session summary ─────────────────────────────── */}
      <SectionTitle>Recent sessions</SectionTitle>
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        Last 20 anonymous sessions. Each row shows total events, searches, and outbound clicks in that session.
      </p>
      {recentSessions.length === 0 ? (
        <AdminEmptyState>No sessions recorded yet. Visit the site to generate data.</AdminEmptyState>
      ) : (
        <AdminTable className="mb-8">
          <thead className={adminTheadRowClass}>
            <tr>
              <th className={adminThClass}>Session</th>
              <th className={`${adminThClass} text-right`}>Events</th>
              <th className={`${adminThClass} text-right`}>Searches</th>
              <th className={`${adminThClass} text-right`}>Clicks</th>
              <th className={adminThClass}>Last active</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((s) => (
              <tr key={s.sessionId} className={adminTbodyRowClass}>
                <td className={`${adminTdClass} font-mono text-xs text-stone-600 dark:text-stone-300`}>
                  {s.sessionId?.slice(0, 8)}…
                </td>
                <td className={`${adminTdClass} text-right font-mono text-stone-700 dark:text-stone-200`}>
                  {Number(s.events)}
                </td>
                <td className={`${adminTdClass} text-right font-mono text-stone-700 dark:text-stone-200`}>
                  {Number(s.searches)}
                </td>
                <td className={`${adminTdClass} text-right font-mono text-stone-700 dark:text-stone-200`}>
                  {Number(s.clicks)}
                </td>
                <td className={`${adminTdClass} text-xs text-stone-500 dark:text-stone-400`}>
                  {s.lastSeen ? new Date(s.lastSeen).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      {/* ── Definitions ─────────────────────────────────── */}
      <SectionTitle>Metric definitions</SectionTitle>
      <AdminPanel>
        <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Page view</strong>{" "}
            — any client-side navigation to a TimeScout page.
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Search</strong>{" "}
            — a visit to /search with a query string present.
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Filter apply</strong>{" "}
            — a search page load where at least one sidebar filter is active (brand, price, condition, etc.).
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Click</strong>{" "}
            — an outbound tap on &quot;View&quot; that sends the user to the original listing source.
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Session</strong>{" "}
            — anonymous 30-day session identified by a random UUID cookie (ts_sid). No raw IPs stored.
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Search → Click rate</strong>{" "}
            — outbound clicks ÷ searches. Measures how often search results lead to engagement.
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Zero-result sessions</strong>{" "}
            — sessions that searched but never clicked any listing. Signals search quality issues.
          </li>
        </ul>
      </AdminPanel>
    </AdminShell>
  );
}
