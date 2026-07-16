"use client";

import { useState } from "react";

/**
 * Renders a card image, advancing through `sources` whenever one fails to load.
 * When every source is exhausted (or there are none), shows a styled placeholder
 * with the card name so the grid never has broken images or empty gaps.
 */
export function CardImage({ sources, alt }: { sources: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const src = sources[idx];

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-white/[0.04] to-transparent p-3 text-center">
        <span className="text-2xl opacity-30">🃏</span>
        <span className="line-clamp-3 text-[10px] leading-tight text-white/40">
          {alt}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
    />
  );
}
