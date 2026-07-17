/**
 * The line under a card's name that says WHICH card this actually is.
 *
 * The card number leads, because on singles it's the only unambiguous
 * identifier we have. There are two One Piece cards named "Monkey.D.Luffy (SP)"
 * — ST26-005 (SR, Adventure on Kami's Island) and OP05-060 (L, Extra Booster:
 * Anime 25th Collection). Name plus a truncated set name can't tell them apart;
 * the number can, and it carries the set code (OP14, EB04, ST26) that traders
 * quote by.
 *
 * The set name is deliberately separate rather than appended, because it isn't
 * the same fact as the set code — "Bad Manners Kick Course" is OP04-016 but
 * lives in "Premium Booster -The Best- Vol. 2", since Premium Booster reprints
 * it. Both matter. It also gets two lines: these names run long ("Extra Booster:
 * Anime 25th Collection") and clamping to one turned them into "Extra Booster:
 * Anime 25th…", which is where the ambiguity started.
 *
 * Sealed products have no number, so they just show the set.
 */
export function CardIdentity({
  number,
  setCode,
  rarity,
  groupName,
}: {
  number: string | null;
  /** Set code (OP05, EB01). Fills the number slot for sealed products. */
  setCode?: string | null;
  rarity: string | null;
  groupName: string;
}) {
  // A single's number already contains the code (OP05-060), so showing setCode
  // too would just stutter. Sealed has no number, and the code is exactly what a
  // One Piece buyer scans for — so it takes the empty slot.
  const lead = number ?? setCode ?? null;
  return (
    <div className="flex flex-col gap-0.5">
      {(lead || rarity) && (
        <div className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] leading-snug">
          {lead && (
            <span className="font-medium tabular-nums text-ink-dim">{lead}</span>
          )}
          {lead && rarity && (
            <span aria-hidden className="text-ink-faint/40">
              ·
            </span>
          )}
          {rarity && <span className="text-ink-faint">{rarity}</span>}
        </div>
      )}
      <div className="line-clamp-2 text-[11px] leading-snug text-ink-faint/70">
        {groupName}
      </div>
    </div>
  );
}
