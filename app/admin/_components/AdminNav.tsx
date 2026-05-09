import Link from "next/link";

export type AdminNavActive =
  | "review"
  | "classifier"
  | "analytics"
  | "clicks"
  | "dataHealth";

const ITEMS: { key: AdminNavActive; href: string; label: string }[] = [
  { key: "review", href: "/admin/review", label: "Review queue" },
  { key: "classifier", href: "/admin/ai", label: "Classifier" },
  { key: "analytics", href: "/admin/analytics", label: "Analytics" },
  { key: "clicks", href: "/admin/clicks", label: "Clicks" },
  { key: "dataHealth", href: "/admin/data-health", label: "Data health" },
];

const navPillBase =
  "rounded-full px-3 py-1.5 text-xs font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-950";

const inactivePill =
  "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700";

const activePill =
  "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900";

export function AdminNav({ active }: { active: AdminNavActive }) {
  return (
    <nav aria-label="Admin sections" className="mb-8 flex flex-wrap items-center gap-2">
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`${navPillBase} ${isActive ? activePill : inactivePill}`}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className={`${navPillBase} ${inactivePill}`}
      >
        Home
      </Link>
    </nav>
  );
}
