"use client";

import { useRef, useState, useCallback } from "react";

export function ListingImage({
  src,
  alt,
  isSold,
}: {
  src: string;
  alt: string;
  isSold?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const imgRefCallback = useCallback(
    (node: HTMLImageElement | null) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (!node) return;

      if (node.complete && node.naturalWidth > 0) {
        setStatus("loaded");
        return;
      }

      setStatus("loading");
      timeoutRef.current = setTimeout(() => {
        setStatus((s) => (s === "loading" ? "failed" : s));
      }, 15_000);
    },
    // Reset when src changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src],
  );

  return (
    <>
      {status === "loading" && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-neutral-50">
          <span className="h-7 w-7 rounded-full border-2 border-neutral-200 border-t-accent motion-safe:animate-spin" />
        </div>
      )}
      {status === "failed" && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-1 bg-neutral-50 px-4 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Photo unavailable
          </span>
          <span className="max-w-[90%] text-[11px] leading-snug text-neutral-500">
            Please check listing for details.
          </span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRefCallback}
        src={src}
        alt={alt}
        className={`relative z-[1] h-full w-full bg-neutral-50 object-contain transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        } ${isSold ? "grayscale" : ""}`}
        loading="lazy"
        onLoad={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setStatus("loaded");
        }}
        onError={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setStatus("failed");
        }}
      />
    </>
  );
}
