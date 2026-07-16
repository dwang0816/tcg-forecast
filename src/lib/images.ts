// Builds an ordered list of candidate image URLs for a card. The UI tries them
// in order, falling back to the next when one fails to load, so cards missing a
// TCGplayer image can still show art from a secondary source.

const OP_CODE = /^[A-Za-z0-9]+-[A-Za-z0-9]+$/;

// TCGplayer serves tiny 200px thumbnails by default (blurry when displayed
// larger). Upgrade to a crisp 1000x1000 render; keep the 200w as a backup.
function hiRes(url: string): string {
  return url.replace(
    /(tcgplayer-cdn\.tcgplayer\.com\/product\/\d+)_200w\.jpg/,
    "$1_in_1000x1000.jpg",
  );
}

/**
 * Does this card have real card art, as opposed to a seller's photo?
 *
 * Callers use this to decide whether to caption the image. If it's false and an
 * eBay photo exists, that photo is what the reader will see, and it must be
 * labelled as someone's listing rather than passed off as the card's artwork.
 */
export function hasOfficialArt(opts: {
  imageUrl: string | null;
  altImageUrls?: string[] | null;
}): boolean {
  return Boolean(opts.imageUrl) || (opts.altImageUrls?.length ?? 0) > 0;
}

export function cardImageSources(opts: {
  game?: string | null;
  number: string | null;
  imageUrl: string | null;
  /** Images from sibling printings that share this card's number. */
  altImageUrls?: string[] | null;
  /** A photo from a live eBay listing — last resort, and always attributed. */
  ebayPhotoUrl?: string | null;
}): string[] {
  const sources: string[] = [];
  const push = (u: string | null | undefined) => {
    if (u && !sources.includes(u)) sources.push(u);
  };
  // Push a TCGplayer image at high resolution first, original as a backup.
  const pushImg = (u: string | null | undefined) => {
    if (!u) return;
    const hi = hiRes(u);
    push(hi);
    if (hi !== u) push(u);
  };

  // Primary: whatever TCGplayer gave us (null when imageCount was 0).
  pushImg(opts.imageUrl);

  // Fallbacks: sibling printings' images for this card number.
  for (const u of opts.altImageUrls ?? []) pushImg(u);

  // One Piece: the official card art is served by optcgapi at a predictable
  // path keyed on the card code (e.g. OP01-024 -> .../Card_Images/OP01-024.jpg).
  if (opts.game === "onepiece" && opts.number) {
    const code = opts.number.trim().toUpperCase();
    if (OP_CODE.test(code)) {
      push(`https://optcgapi.com/media/static/Card_Images/${code}.jpg`);
    }
  }

  // Last: a photo from a live eBay listing. Only reached when nothing above
  // exists, i.e. TCGplayer never photographed this card — whole old Japanese
  // sets. It's a seller's photograph of their own copy: sometimes a clean scan,
  // sometimes sleeved and angled, and for two-part LEGEND cards a picture of both
  // halves on a table. So callers pair it with hasOfficialArt() and caption it.
  // Never reordered above the real art.
  push(opts.ebayPhotoUrl);

  return sources;
}
