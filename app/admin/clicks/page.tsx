import { desc, eq, gte, sql } from "drizzle-orm";
import {
  AdminEmptyState,
  AdminHeader,
  AdminNav,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  SectionTitle,
  adminListCardClass,
} from "@/app/admin/_components";
import { getDb } from "@/db";
import { clicks, listings, sources } from "@/db/schema";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminClicksPage() {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totals24h, totals7d, recent, topListings, topSources, placements, daily] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(gte(clicks.createdAt, since24h)),
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(gte(clicks.createdAt, since7d)),
    db
      .select({
        id: clicks.id,
        listingId: clicks.listingId,
        createdAt: clicks.createdAt,
        placement: clicks.placement,
        title: listings.title,
        sourceName: sources.name,
      })
      .from(clicks)
      .innerJoin(listings, eq(listings.id, clicks.listingId))
      .innerJoin(sources, eq(sources.id, clicks.sourceId))
      .orderBy(desc(clicks.createdAt))
      .limit(25),
    db
      .select({
        listingId: clicks.listingId,
        count: sql<number>`COUNT(*)`,
        title: listings.title,
      })
      .from(clicks)
      .innerJoin(listings, eq(listings.id, clicks.listingId))
      .where(gte(clicks.createdAt, since7d))
      .groupBy(clicks.listingId, listings.title)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
    db
      .select({
        sourceId: clicks.sourceId,
        name: sources.name,
        count: sql<number>`COUNT(*)`,
      })
      .from(clicks)
      .innerJoin(sources, eq(sources.id, clicks.sourceId))
      .where(gte(clicks.createdAt, since7d))
      .groupBy(clicks.sourceId, sources.name)
      .orderBy(sql`COUNT(*) DESC`),
    db
      .select({
        placement: sql<string>`COALESCE(${clicks.placement}, 'unknown')`,
        count: sql<number>`COUNT(*)`,
      })
      .from(clicks)
      .where(gte(clicks.createdAt, since7d))
      .groupBy(sql`COALESCE(${clicks.placement}, 'unknown')`)
      .orderBy(sql`COUNT(*) DESC`),
    db
      .select({
        day: sql<string>`DATE(${clicks.createdAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(clicks)
      .where(gte(clicks.createdAt, since7d))
      .groupBy(sql`DATE(${clicks.createdAt})`)
      .orderBy(sql`DATE(${clicks.createdAt}) ASC`),
  ]);

  const total24h = Number(totals24h[0]?.count ?? 0);
  const total7d = Number(totals7d[0]?.count ?? 0);
  const avgPerDay7d = Math.round(total7d / 7);
  const topSourceName = topSources[0]?.name ?? "—";
  const topSourceShare = total7d > 0 ? Math.round((Number(topSources[0]?.count ?? 0) / total7d) * 100) : 0;
  const uniqueListingsClicked = topListings.length;
  const busiestDay = [...daily].sort((a, b) => Number(b.count) - Number(a.count))[0];

  return (
    <AdminShell>
      <AdminHeader title="Outbound clicks" />
      <AdminNav active="clicks" />

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="Clicks (24h)" value={total24h.toLocaleString()} detail="Total outbound clicks in the last 24 hours." />
        <AdminStatCard
          label="Clicks (7d)"
          value={total7d.toLocaleString()}
          detail={`Total outbound clicks in the last 7 days (${avgPerDay7d}/day avg).`}
        />
        <AdminStatCard
          label="Unique listings clicked (7d)"
          value={uniqueListingsClicked.toLocaleString()}
          detail="How many distinct listings received at least one click (top 10 scope)."
        />
        <AdminStatCard
          label="Top source share (7d)"
          value={topSourceName === "—" ? "—" : `${topSourceShare}%`}
          detail="Percent of 7-day clicks from the highest-clicked source."
        />
      </section>

      <AdminPanel className="mb-8">
        <SectionTitle className="mb-3">Metric definitions</SectionTitle>
        <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Outbound clicks</strong>{" "}
            are taps on the View button that send users to the source listing.
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Placement</strong>{" "}
            indicates where the click happened (search, home, etc).
          </li>
          <li>
            <strong className="font-semibold text-stone-800 dark:text-stone-100">Top source share</strong>{" "}
            highlights concentration risk in traffic quality.
          </li>
        </ul>
      </AdminPanel>

      <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Clicks by source (last 7 days)</SectionTitle>
          {topSources.length === 0 ? (
            <AdminEmptyState>No source click data yet.</AdminEmptyState>
          ) : (
            <ul className={adminListCardClass}>
              {topSources.map((s) => {
                const count = Number(s.count);
                const share = total7d > 0 ? Math.round((count / total7d) * 100) : 0;
                return (
                  <li key={s.sourceId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-stone-800 dark:text-stone-100">{s.name}</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">{share}% share of 7d clicks</p>
                    </div>
                    <span className="font-mono text-stone-500 dark:text-stone-400">{count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>Clicks by placement (last 7 days)</SectionTitle>
          {placements.length === 0 ? (
            <AdminEmptyState>No placement data yet.</AdminEmptyState>
          ) : (
            <ul className={adminListCardClass}>
              {placements.map((p) => {
                const count = Number(p.count);
                const share = total7d > 0 ? Math.round((count / total7d) * 100) : 0;
                return (
                  <li key={p.placement} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-stone-800 dark:text-stone-100">{p.placement}</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">{share}% share of 7d clicks</p>
                    </div>
                    <span className="font-mono text-stone-500 dark:text-stone-400">{count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Daily trend (last 7 days)</SectionTitle>
        {daily.length === 0 ? (
          <AdminEmptyState>No daily trend yet.</AdminEmptyState>
        ) : (
          <ul className={adminListCardClass}>
            {daily.map((d) => {
              const count = Number(d.count);
              const widthPct = Math.max(4, total7d > 0 ? Math.round((count / total7d) * 100) : 0);
              const isBusiest = busiestDay?.day === d.day;
              return (
                <li key={d.day} className="px-4 py-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-stone-700 dark:text-stone-200">
                      {new Date(`${d.day}T00:00:00`).toLocaleDateString()}
                      {isBusiest ? " · busiest" : ""}
                    </span>
                    <span className="font-mono text-stone-500 dark:text-stone-400">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      className="h-full rounded-full bg-stone-400 dark:bg-stone-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>Top listings (last 7 days)</SectionTitle>
        {topListings.length === 0 ? (
          <AdminEmptyState>
            No clicks yet. Visit <code>/search</code> and click &quot;View&quot; on a listing.
          </AdminEmptyState>
        ) : (
          <ul className={adminListCardClass}>
            {topListings.map((l) => (
              <li key={l.listingId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="line-clamp-1 text-stone-800 dark:text-stone-100">{l.title}</span>
                <span className="font-mono text-stone-500 dark:text-stone-400">{Number(l.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Recent clicks</SectionTitle>
        {recent.length === 0 ? (
          <AdminEmptyState>No clicks recorded yet.</AdminEmptyState>
        ) : (
          <ul className={adminListCardClass}>
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-stone-800 dark:text-stone-100">{c.title}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {c.sourceName}
                    {c.placement ? ` · via ${c.placement}` : ""}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">
                  {timeAgo(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
