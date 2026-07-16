import { money, percent, signedMoney } from "@/lib/format";

export interface CardTileProps {
  rank: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  url: string | null;
  subTypeName: string;
  rarity: string | null;
  number: string | null;
  price: number;
  change?: { pct: number; abs: number } | null;
}

export function CardTile({
  rank,
  name,
  groupName,
  imageUrl,
  url,
  subTypeName,
  rarity,
  price,
  change,
}: CardTileProps) {
  const up = change ? change.pct >= 0 : false;

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-black/30">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/30">
            No image
          </div>
        )}

        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white/80 backdrop-blur">
          #{rank}
        </span>

        {subTypeName && subTypeName !== "Normal" && (
          <span className="absolute right-2 top-2 rounded-md bg-sky-500/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
            {subTypeName}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-medium leading-snug text-white/90">
          {name}
        </div>
        <div className="line-clamp-1 text-xs text-white/40">
          {groupName}
          {rarity ? ` · ${rarity}` : ""}
        </div>

        <div className="mt-auto flex items-end justify-between pt-2">
          <span className="text-base font-semibold tabular-nums text-white">
            {money(price)}
          </span>

          {change && (
            <span
              className={`flex flex-col items-end rounded-md px-2 py-1 text-right text-xs font-semibold tabular-nums ${
                up
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              <span>{percent(change.pct)}</span>
              <span className="text-[10px] font-normal opacity-70">
                {signedMoney(change.abs)}
              </span>
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
