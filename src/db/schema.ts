import {
  pgTable,
  integer,
  text,
  date,
  boolean,
  doublePrecision,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/** A TCGplayer extendedData entry, e.g. { name: "HP", displayName: "HP", value: "220" }. */
export interface ExtendedField {
  name: string;
  displayName: string;
  value: string;
}

// One row per TCGplayer product (a single card, or a sealed product).
// productId is globally unique across all games on TCGplayer.
export const cards = pgTable(
  "cards",
  {
    productId: integer("product_id").primaryKey(),
    game: text("game").notNull(), // GameSlug: pokemon | onepiece | riftbound
    // "EN" | "JP". Derived from which TCGplayer category the product came from
    // (Pokemon=3 vs Pokemon Japan=85). Only Pokémon has both.
    language: text("language").notNull().default("EN"),
    categoryId: integer("category_id").notNull(),
    groupId: integer("group_id").notNull(),
    groupName: text("group_name").notNull(), // the set / expansion name
    name: text("name").notNull(),
    cleanName: text("clean_name"),
    imageUrl: text("image_url"),
    url: text("url"), // tcgplayer product page
    rarity: text("rarity"),
    number: text("number"),
    /** Set code (OP05, EB01) derived at ingest from the set's singles. */
    setCode: text("set_code"),
    // The rest of TCGplayer's extendedData (card text, HP, attacks, colour, cost,
    // power, subtypes…). It ships in the same payload we already download, and
    // it's what makes a card page worth reading.
    extended: jsonb("extended").$type<ExtendedField[]>(),
    // Fallback images: other printings that share this card's number. Variants
    // like "(Metal) (Prize Wall)" often lack their own TCGplayer image; the UI
    // tries these until one loads (see lib/ingest.ts).
    altImageUrls: text("alt_image_urls").array(),
    // true = individual card ("single"); false = sealed product (box/pack/deck)
    isSingle: boolean("is_single").notNull().default(false),
    // true = valuable enough to snapshot prices for (see lib/tracking.ts)
    tracked: boolean("tracked").notNull().default(true),
    // Current prices for EVERY card, refreshed each ingest — not just tracked
    // ones. Daily *history* stays limited to tracked cards (that's the big
    // table), but search needs a price for all 71k, and these cost nothing:
    // the ingest already downloads them, we were just discarding the cheap ones.
    // Taken from the product's highest-value printing.
    marketPrice: doublePrecision("market_price"),
    listingPrice: doublePrecision("listing_price"),
    lowPrice: doublePrecision("low_price"),
    highPrice: doublePrecision("high_price"),
    priceDate: date("price_date"),

    /**
     * A photo of the card from a live eBay listing, for the ~3% of tracked cards
     * TCGplayer has no art for. The URL only — the photograph is the seller's, so
     * it's shown captioned and linked, never copied. See lib/ebay.ts.
     *
     * Only ever a fallback: cardImageSources tries real art first, and ingest
     * clears these the moment TCGplayer publishes one.
     */
    ebayPhotoUrl: text("ebay_photo_url"),
    ebayListingUrl: text("ebay_listing_url"),
    ebayListingTitle: text("ebay_listing_title"),
    ebayListingPrice: doublePrecision("ebay_listing_price"),
    /** When we last asked eBay. Non-null with a null url means "asked, found nothing". */
    ebayPhotoAt: timestamp("ebay_photo_at"),

    /** Human verdict on that photo from /admin/photos: 'good' | 'bad' | null. */
    photoVerdict: text("photo_verdict"),
    photoReviewedAt: timestamp("photo_reviewed_at"),
    /**
     * Photos a human rejected. Load-bearing: rejecting clears ebay_photo_url, so
     * without this the next photo run would rediscover the same listing and put
     * the same bad picture back.
     */
    rejectedPhotoUrls: text("rejected_photo_urls").array(),
    /**
     * How many times a human has called this card good or bad. Rerolls don't
     * count — the queue rotates judged cards back around, so this is the card's
     * running review history, not a measure of eBay's supply.
     */
    photoReviewCount: integer("photo_review_count").notNull().default(0),
    /**
     * When an unattended photo run installed the current picture — the marker for
     * "new" in the queue. Not ebay_photo_at: the reroll asks eBay too, and a photo
     * you picked yourself isn't news. Cleared when a human chooses one.
     */
    photoFoundAt: timestamp("photo_found_at"),

    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("cards_game_idx").on(t.game),
    index("cards_game_single_idx").on(t.game, t.isSingle),
    index("cards_game_lang_idx").on(t.game, t.language, t.isSingle),
    index("cards_tracked_idx").on(t.tracked),
  ],
);

// One row per (product, price subtype, day). subTypeName is e.g. "Normal" / "Foil".
export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => cards.productId, { onDelete: "cascade" }),
    subTypeName: text("sub_type_name").notNull(),
    date: date("date").notNull(), // snapshot date (UTC), "YYYY-MM-DD"
    marketPrice: doublePrecision("market_price"),
    lowPrice: doublePrecision("low_price"),
    midPrice: doublePrecision("mid_price"),
    highPrice: doublePrecision("high_price"),
    directLowPrice: doublePrecision("direct_low_price"),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.subTypeName, t.date] }),
    index("snap_date_idx").on(t.date),
  ],
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type NewPriceSnapshot = typeof priceSnapshots.$inferInsert;
