import { LiveSourceMark } from "@/components/LiveSourceMark";

type LiveStripProps = {
  total: number;
  sourceLabel: string;
};

export function LiveStrip({ total, sourceLabel }: LiveStripProps) {
  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <LiveSourceMark sourceLabel={sourceLabel} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
              {sourceLabel}
            </p>
            <p className="text-sm font-medium text-neutral-700">
              <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Active listings · {total.toLocaleString()}
              </span>
            </p>
          </div>
        </div>
        <p className="max-w-md text-right text-xs leading-relaxed text-neutral-500">
          Same filters and sort as{" "}
          <span className="font-medium text-neutral-700">/search</span>. Cards link out to the
          original post or storefront — we don&apos;t sell here.
        </p>
      </div>
    </div>
  );
}
