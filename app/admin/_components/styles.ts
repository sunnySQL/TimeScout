/** Shared Tailwind fragments for admin tables and controls */

export const adminTableWrapClass =
  "overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900";

export const adminTableClass = "w-full text-left text-sm";

export const adminTheadRowClass =
  "border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-400";

export const adminThClass = "px-3 py-2 font-medium";

export const adminTbodyRowClass =
  "border-b border-stone-100 last:border-0 dark:border-stone-800";

export const adminTdClass = "px-3 py-2";

/** Primary actions (Apply when dirty, dark toolbar buttons) */
export const adminBtnPrimaryClass =
  "rounded px-2 py-1 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-stone-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-900 cursor-pointer bg-stone-800 text-white hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white dark:focus-visible:ring-stone-300";

/** Secondary / outline (pagination, neutral actions) */
export const adminBtnSecondaryClass =
  "rounded border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 outline-none transition hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:ring-stone-500";

/** Muted pagination disabled */
export const adminBtnMutedClass =
  "rounded border border-transparent px-3 py-1 text-xs text-stone-400";

/** Inline edit / compact secondary */
export const adminBtnGhostClass =
  "rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600 outline-none transition hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-stone-400 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:focus-visible:ring-stone-500";

export const adminSelectClass =
  "rounded border border-stone-300 bg-white px-2 py-1 text-xs outline-none ring-stone-400/30 focus:border-stone-500 focus:ring-2 dark:border-stone-600 dark:bg-stone-800 dark:focus:border-stone-500 dark:focus:ring-stone-600";

/** List/card stacks (clicks breakdown rows) */
export const adminListCardClass =
  "divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900";
