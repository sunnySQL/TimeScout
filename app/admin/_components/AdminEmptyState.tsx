import type { ReactNode } from "react";

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-6 text-sm text-stone-600 dark:border-stone-600 dark:bg-stone-950/30 dark:text-stone-400">
      {children}
    </div>
  );
}
