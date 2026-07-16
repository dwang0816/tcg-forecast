import {
  pgTable,
  integer,
  text,
  date,
  doublePrecision,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// One row per TCGplayer product (a single card, or a sealed product).
// productId is globally unique across all games on TCGplayer.
export const cards = pgTable(
  "cards",
  {
    productId: integer("product_id").primaryKey(),
    game: text("game").notNull(), // GameSlug: pokemon | onepiece | riftbound
    categoryId: integer("category_id").notNull(),
    groupId: integer("group_id").notNull(),
    groupName: text("group_name").notNull(), // the set / expansion name
    name: text("name").notNull(),
    cleanName: text("clean_name"),
    imageUrl: text("image_url"),
    url: text("url"), // tcgplayer product page
    rarity: text("rarity"),
    number: text("number"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("cards_game_idx").on(t.game)],
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
