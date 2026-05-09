import {
  AdminEmptyState,
  AdminHeader,
  AdminNav,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  AdminTable,
  SectionTitle,
  adminTdClass,
  adminThClass,
  adminTheadRowClass,
  adminTbodyRowClass,
} from "@/app/admin/_components";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { listings, sources } from "@/db/schema";
import { timeAgo } from "@/lib/format";
import { isAiAvailable } from "@/lib/ai/classify";
import { isLocalAvailable } from "@/lib/ml/index";

export const dynamic = "force-dynamic";

export default async function AdminClassifierPage() {
  const db = getDb();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalCounts,
    sourceCoverage,
    localLowConf,
    localHighConf,
    aiLowConf,
    aiHighConf,
    unclassified,
  ] = await Promise.all([
    db
      .select({
        totalListings: sql<number>`COUNT(*)`,
        hasCondition: sql<number>`SUM(CASE WHEN \`condition\` IS NOT NULL THEN 1 ELSE 0 END)`,
        hasWatchType: sql<number>`SUM(CASE WHEN watch_type IS NOT NULL THEN 1 ELSE 0 END)`,
        hasBrand: sql<number>`SUM(CASE WHEN brand IS NOT NULL THEN 1 ELSE 0 END)`,
        hasReference: sql<number>`SUM(CASE WHEN \`reference\` IS NOT NULL THEN 1 ELSE 0 END)`,
        localClassified: sql<number>`SUM(CASE WHEN local_classified_at IS NOT NULL THEN 1 ELSE 0 END)`,
        aiClassified: sql<number>`SUM(CASE WHEN ai_classified_at IS NOT NULL THEN 1 ELSE 0 END)`,
        sourceRegex: sql<number>`SUM(CASE WHEN classifier_source = 'regex' THEN 1 ELSE 0 END)`,
        sourceLocal: sql<number>`SUM(CASE WHEN classifier_source = 'local' THEN 1 ELSE 0 END)`,
        sourceAi: sql<number>`SUM(CASE WHEN classifier_source = 'ai' THEN 1 ELSE 0 END)`,
        sourceNull: sql<number>`SUM(CASE WHEN classifier_source IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(listings),
    // Per-field coverage by source
    db
      .select({
        field: sql<string>`'condition'`,
        total: sql<number>`COUNT(*)`,
        filled: sql<number>`SUM(CASE WHEN \`condition\` IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(listings),
    // Local low-confidence
    db
      .select({
        id: listings.id,
        title: listings.title,
        condition: listings.condition,
        watchType: listings.watchType,
        brand: listings.brand,
        reference: listings.reference,
        localConfidence: listings.localConfidence,
        localClassifiedAt: listings.localClassifiedAt,
        classifierSource: listings.classifierSource,
        listingUrl: listings.listingUrl,
        sourceName: sources.name,
      })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .where(
        and(
          isNotNull(listings.localClassifiedAt),
          sql`CAST(${listings.localConfidence} AS DECIMAL(3,2)) > 0 AND CAST(${listings.localConfidence} AS DECIMAL(3,2)) < 0.70`,
        ),
      )
      .orderBy(desc(listings.localClassifiedAt))
      .limit(30),
    // Local high-confidence
    db
      .select({
        id: listings.id,
        title: listings.title,
        condition: listings.condition,
        watchType: listings.watchType,
        brand: listings.brand,
        reference: listings.reference,
        localConfidence: listings.localConfidence,
        localClassifiedAt: listings.localClassifiedAt,
        classifierSource: listings.classifierSource,
        listingUrl: listings.listingUrl,
        sourceName: sources.name,
      })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .where(
        and(
          isNotNull(listings.localClassifiedAt),
          gte(listings.localClassifiedAt, since7d),
          sql`CAST(${listings.localConfidence} AS DECIMAL(3,2)) >= 0.70`,
        ),
      )
      .orderBy(desc(listings.localClassifiedAt))
      .limit(20),
    // AI low-confidence
    db
      .select({
        id: listings.id,
        title: listings.title,
        condition: listings.condition,
        watchType: listings.watchType,
        brand: listings.brand,
        reference: listings.reference,
        localConfidence: listings.aiConfidence,
        localClassifiedAt: listings.aiClassifiedAt,
        classifierSource: sql<string>`'ai'`,
        listingUrl: listings.listingUrl,
        sourceName: sources.name,
      })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .where(
        and(
          isNotNull(listings.aiClassifiedAt),
          sql`CAST(${listings.aiConfidence} AS DECIMAL(3,2)) < 0.80`,
        ),
      )
      .orderBy(desc(listings.aiClassifiedAt))
      .limit(30),
    // AI high-confidence
    db
      .select({
        id: listings.id,
        title: listings.title,
        condition: listings.condition,
        watchType: listings.watchType,
        brand: listings.brand,
        reference: listings.reference,
        localConfidence: listings.aiConfidence,
        localClassifiedAt: listings.aiClassifiedAt,
        classifierSource: sql<string>`'ai'`,
        listingUrl: listings.listingUrl,
        sourceName: sources.name,
      })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .where(
        and(
          isNotNull(listings.aiClassifiedAt),
          gte(listings.aiClassifiedAt, since7d),
          sql`CAST(${listings.aiConfidence} AS DECIMAL(3,2)) >= 0.80`,
        ),
      )
      .orderBy(desc(listings.aiClassifiedAt))
      .limit(20),
    // Completely unclassified
    db
      .select({
        id: listings.id,
        title: listings.title,
        listingUrl: listings.listingUrl,
        firstSeenAt: listings.firstSeenAt,
        sourceName: sources.name,
      })
      .from(listings)
      .innerJoin(sources, eq(sources.id, listings.sourceId))
      .where(
        and(
          isNull(listings.condition),
          isNull(listings.watchType),
          isNull(listings.localClassifiedAt),
          isNull(listings.aiClassifiedAt),
        ),
      )
      .orderBy(desc(listings.firstSeenAt))
      .limit(25),
  ]);

  const c = totalCounts[0] ?? {
    totalListings: 0,
    hasCondition: 0,
    hasWatchType: 0,
    hasBrand: 0,
    hasReference: 0,
    localClassified: 0,
    aiClassified: 0,
    sourceRegex: 0,
    sourceLocal: 0,
    sourceAi: 0,
    sourceNull: 0,
  };
  const n = (v: unknown) => Number(v ?? 0);
  const total = n(c.totalListings);
  const pct = (v: unknown) =>
    total > 0 ? ((n(v) / total) * 100).toFixed(1) + "%" : "0%";

  return (
    <AdminShell>
      <AdminHeader title="Classifier review" />
      <AdminNav active="classifier" />

      {/* Status banners */}
      <div className="mb-6 flex flex-wrap gap-3">
        {!isLocalAvailable() && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Local models not loaded.</strong> Run training scripts in <code>ml/</code>.
          </div>
        )}
        {!isAiAvailable() && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>OPENAI_API_KEY not set.</strong> AI fallback is disabled.
          </div>
        )}
      </div>

      {/* KPI cards */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="Total listings" value={total.toLocaleString()} detail="All listings in the database." />
        <AdminStatCard
          label="Has condition"
          value={`${n(c.hasCondition).toLocaleString()} (${pct(c.hasCondition)})`}
          detail="Rows with a non-null condition label."
        />
        <AdminStatCard
          label="Has brand"
          value={`${n(c.hasBrand).toLocaleString()} (${pct(c.hasBrand)})`}
          detail="Rows with a parsed brand."
        />
        <AdminStatCard
          label="Has reference"
          value={`${n(c.hasReference).toLocaleString()} (${pct(c.hasReference)})`}
          detail="Rows with a parsed reference number."
        />
      </section>

      {/* Source breakdown */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="Source: regex" value={`${n(c.sourceRegex).toLocaleString()}`} detail="Labeled by deterministic regex parsers." />
        <AdminStatCard label="Source: local ML" value={`${n(c.sourceLocal).toLocaleString()}`} detail="Labeled by the local TF-IDF + LR model." />
        <AdminStatCard label="Source: OpenAI" value={`${n(c.sourceAi).toLocaleString()}`} detail="Labeled by GPT-4o-mini fallback." />
        <AdminStatCard label="Source: untagged" value={`${n(c.sourceNull).toLocaleString()}`} detail="Legacy rows without a classifier_source tag." />
      </section>

      {/* Architecture explainer */}
      <section className="mb-8">
        <SectionTitle>Classification cascade</SectionTitle>
        <AdminPanel className="mt-0">
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-stone-600 dark:text-stone-300">
          <li>
            <strong>Regex</strong> — free, instant, deterministic. Catches ~70% of listings.
          </li>
          <li>
            <strong>Local TF-IDF + Logistic Regression</strong> — free, &lt;5ms, trained on your data. Fills in ~15% more.
            Models: <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">condition.json</code>,{" "}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">watch_type.json</code>,{" "}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">brand_disambiguator.json</code>,{" "}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">reference_scorer.json</code>.
          </li>
          <li>
            <strong>OpenAI fallback</strong> (opt-in via <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">--ai</code>) — ~$0.0002/call, handles edge cases regex and local miss.
          </li>
        </ol>
        </AdminPanel>
      </section>

      {/* Local: low confidence */}
      <section className="mb-8">
        <SectionTitle>Local ML — low confidence (&lt;0.70)</SectionTitle>
        {localLowConf.length === 0 ? (
          <AdminEmptyState>
            No low-confidence local predictions. Run <code>npm run backfill:local</code> to process listings.
          </AdminEmptyState>
        ) : (
          <ClassifierTable rows={localLowConf} />
        )}
      </section>

      {/* Local: high confidence */}
      <section className="mb-8">
        <SectionTitle>Local ML — high confidence (last 7d, sample)</SectionTitle>
        {localHighConf.length === 0 ? (
          <AdminEmptyState>No recent local ML activity.</AdminEmptyState>
        ) : (
          <ClassifierTable rows={localHighConf} />
        )}
      </section>

      {/* AI: low confidence */}
      <section className="mb-8">
        <SectionTitle>OpenAI — low confidence (&lt;0.80)</SectionTitle>
        {aiLowConf.length === 0 ? (
          <AdminEmptyState>No low-confidence AI predictions.</AdminEmptyState>
        ) : (
          <ClassifierTable rows={aiLowConf} />
        )}
      </section>

      {/* AI: high confidence */}
      <section className="mb-8">
        <SectionTitle>OpenAI — high confidence (last 7d, sample)</SectionTitle>
        {aiHighConf.length === 0 ? (
          <AdminEmptyState>No recent AI activity. Try <code>npm run ingest:reddit -- --ai</code>.</AdminEmptyState>
        ) : (
          <ClassifierTable rows={aiHighConf} />
        )}
      </section>

      {/* Fully unclassified */}
      <section className="mb-8">
        <SectionTitle>Newest fully unclassified listings</SectionTitle>
        {unclassified.length === 0 ? (
          <AdminEmptyState>Every recent listing has a label.</AdminEmptyState>
        ) : (
          <UnclassifiedTable rows={unclassified} />
        )}
      </section>
    </AdminShell>
  );
}

type ClassifierRow = {
  id: number;
  title: string;
  condition: string | null;
  watchType: string | null;
  brand: string | null;
  reference: string | null;
  localConfidence: string | null;
  localClassifiedAt: Date | null;
  classifierSource: string | null;
  listingUrl: string;
  sourceName: string;
};

function ClassifierTable({ rows }: { rows: ClassifierRow[] }) {
  return (
    <AdminTable>
      <thead className={adminTheadRowClass}>
        <tr>
          <th className={adminThClass}>Conf.</th>
          <th className={adminThClass}>Src</th>
          <th className={adminThClass}>Cond.</th>
          <th className={adminThClass}>Type</th>
          <th className={adminThClass}>Brand</th>
          <th className={adminThClass}>Ref</th>
          <th className={adminThClass}>Title</th>
          <th className={adminThClass}>When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const conf = Number(r.localConfidence ?? 0);
          return (
            <tr key={r.id} className={adminTbodyRowClass}>
              <td className={`${adminTdClass} font-mono text-xs`}>
                <span
                  className={
                    conf >= 0.7
                      ? "text-emerald-700 dark:text-emerald-400"
                      : conf >= 0.5
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-red-700 dark:text-red-400"
                  }
                >
                  {conf.toFixed(2)}
                </span>
              </td>
              <td className={`${adminTdClass} text-xs text-stone-500`}>{r.classifierSource ?? "—"}</td>
              <td className={adminTdClass}>{r.condition ? <Badge text={r.condition} /> : <Dash />}</td>
              <td className={adminTdClass}>{r.watchType ? <Badge text={r.watchType} amber /> : <Dash />}</td>
              <td className={`${adminTdClass} text-xs text-stone-700 dark:text-stone-200`}>{r.brand ?? <Dash />}</td>
              <td className={`${adminTdClass} font-mono text-xs text-stone-700 dark:text-stone-200`}>{r.reference ?? <Dash />}</td>
              <td className={`max-w-[200px] ${adminTdClass}`}>
                <a
                  href={r.listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stone-700 hover:underline dark:text-stone-200"
                >
                  <span className="line-clamp-1">{r.title}</span>
                </a>
              </td>
              <td className={`${adminTdClass} text-xs text-stone-500`}>{r.localClassifiedAt ? timeAgo(r.localClassifiedAt) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </AdminTable>
  );
}

type UnclassifiedRow = {
  id: number;
  title: string;
  listingUrl: string;
  firstSeenAt: Date;
  sourceName: string;
};

function UnclassifiedTable({ rows }: { rows: UnclassifiedRow[] }) {
  return (
    <AdminTable>
      <thead className={adminTheadRowClass}>
        <tr>
          <th className={adminThClass}>Title</th>
          <th className={adminThClass}>Source</th>
          <th className={adminThClass}>First seen</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={adminTbodyRowClass}>
            <td className={adminTdClass}>
              <a href={r.listingUrl} target="_blank" rel="noopener noreferrer" className="text-stone-700 hover:underline dark:text-stone-200">
                <span className="line-clamp-1">{r.title}</span>
              </a>
            </td>
            <td className={`${adminTdClass} text-xs text-stone-500`}>{r.sourceName}</td>
            <td className={`${adminTdClass} text-xs text-stone-500`}>{timeAgo(r.firstSeenAt)}</td>
          </tr>
        ))}
      </tbody>
    </AdminTable>
  );
}

function Badge({ text, amber }: { text: string; amber?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs uppercase tracking-wide ${
      amber
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
    }`}>
      {text}
    </span>
  );
}

function Dash() {
  return <span className="text-stone-400">—</span>;
}
