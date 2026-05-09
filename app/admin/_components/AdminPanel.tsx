import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Bordered content card (explainers, metric definitions, chart shells). */
export function AdminPanel({ children, className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      {children}
    </div>
  );
}
