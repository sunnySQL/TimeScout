import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  /** Secondary line (subtitle / help) */
  detail?: ReactNode;
};

export function AdminStatCard({ label, value, detail }: Props) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <p className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">{value}</p>
      {detail ? (
        <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{detail}</p>
      ) : null}
    </div>
  );
}
