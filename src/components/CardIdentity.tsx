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
  rarity,
  groupName,
}: {
  number: string | null;
  rarity: string | null;
  groupName: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {(number || rarity) && (
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs leading-snug">
          {number && (
            <span className="font-medium tabular-nums text-white/65">{number}</span>
          )}
          {number && rarity && (
            <span aria-hidden className="text-white/20">
              ·
            </span>
          )}
          {rarity && <span className="text-white/45">{rarity}</span>}
        </div>
      )}
      <div className="line-clamp-2 text-[11px] leading-snug text-white/35">
        {groupName}
      </div>
    </div>
  );
}
