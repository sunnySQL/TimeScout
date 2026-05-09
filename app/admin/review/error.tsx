"use client";

export default function AdminReviewError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Review queue failed</h1>
      <p className="mt-3 rounded-lg bg-red-50 p-4 font-mono text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
        {error.message}
      </p>
      <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">
        If this mentions unknown columns (e.g.{" "}
        <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">brand_reviewed</code>,{" "}
        <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">multi_brand_reviewed</code>),
        apply the latest schema:{" "}
        <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">npm run db:push</code>
      </p>
    </main>
  );
}
