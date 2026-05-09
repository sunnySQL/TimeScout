import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Extra bottom margin when followed by helper text */
  className?: string;
};

export function SectionTitle({ children, className = "" }: Props) {
  return (
    <h2
      className={`mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 ${className}`}
    >
      {children}
    </h2>
  );
}
