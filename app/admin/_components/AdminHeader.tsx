import type { ReactNode } from "react";

type Props = {
  title: string;
  eyebrow?: string;
  /** Optional subtitle below the title */
  children?: ReactNode;
};

export function AdminHeader({ title, eyebrow = "Admin", children }: Props) {
  return (
    <header className="mb-6 border-b border-stone-200 pb-6 dark:border-stone-800">
      <p className="text-sm font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
        {title}
      </h1>
      {children ? <div className="mt-2 text-sm text-stone-600 dark:text-stone-400">{children}</div> : null}
    </header>
  );
}
