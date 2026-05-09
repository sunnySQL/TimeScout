/**
 * Badge beside the live index strip — source-specific so multiple sources
 * can appear inline later (Reddit today, others as ingest grows).
 */

function isRedditSource(label: string): boolean {
  const s = label.trim().toLowerCase();
  return s.startsWith("r/") || s.includes("reddit");
}

/** Simplified Snoo-style mark (not Reddit’s official artwork). */
function RedditSnooIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="22" cy="9" r="3.2" fill="currentColor" />
      <path
        d="M19.5 11.5 17 15"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="17" r="9" fill="currentColor" />
      <circle cx="12" cy="16" r="1.6" fill="#FF4500" />
      <circle cx="20" cy="16" r="1.6" fill="#FF4500" />
      <path
        d="M11.5 19.5q4.5 3.5 9 0"
        stroke="#FF4500"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function sourceInitials(label: string): string {
  const t = label.trim();
  if (!t) return "?";
  const parts = t.split(/[\s/_.-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return t.slice(0, 2).toUpperCase();
}

export function LiveSourceMark({ sourceLabel }: { sourceLabel: string }) {
  if (isRedditSource(sourceLabel)) {
    return (
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF4500] text-white shadow-md ring-1 ring-black/10"
        title="Reddit"
        aria-label="Reddit source"
      >
        <RedditSnooIcon className="h-6 w-6" />
      </span>
    );
  }

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-xs font-black text-white shadow-md"
      aria-hidden
    >
      {sourceInitials(sourceLabel)}
    </span>
  );
}
