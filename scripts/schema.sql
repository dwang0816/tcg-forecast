-- Full schema for a fresh database. Idempotent — safe to re-run.
--
--   npm run schema        (applies this to DATABASE_URL)
--
-- Why this exists rather than drizzle/*.sql: the live schema was evolved with
-- `drizzle-kit push` plus hand-applied DDL, so the generated migrations drifted
-- badly out of date — they know nothing about `language`, `extended`, the
-- stamped price columns, `search_text`, or the trigram indexes. This file is the
-- authoritative definition and is what stands a new database up.
--
-- Two things here are deliberately NOT in src/db/schema.ts, because Drizzle
-- can't express them:
--   * search_text — a GENERATED STORED column concatenating every field we
--     search. It's what makes "cleffa obsidian" find a card whose name holds one
--     word and whose set holds the other.
--   * the gin_trgm_ops indexes that make ILIKE/similarity on it fast.
-- Keep this file in sync by hand when schema.ts changes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS cards (
  product_id     integer PRIMARY KEY NOT NULL,
  game           text NOT NULL,
  language       text NOT NULL DEFAULT 'EN',
  category_id    integer NOT NULL,
  group_id       integer NOT NULL,
  group_name     text NOT NULL,
  name           text NOT NULL,
  clean_name     text,
  image_url      text,
  alt_image_urls text[],
  url            text,
  rarity         text,
  number         text,
  extended       jsonb,
  is_single      boolean NOT NULL DEFAULT false,
  tracked        boolean NOT NULL DEFAULT true,
  -- Current prices stamped onto every card by ingest, so the ~64k priced cards
  -- are all browsable without touching the multi-million-row history table.
  market_price   double precision,
  listing_price  double precision,
  low_price      double precision,
  high_price     double precision,
  price_date     date,
  updated_at     timestamp NOT NULL DEFAULT now()
);

-- A photo of the card from a live eBay listing, for the ~3% of tracked cards
-- TCGplayer has no art for (whole old Japanese sets it never photographed).
--
-- The URL only — the photograph belongs to the seller, so it's displayed as
-- their listing, captioned and linked, never copied to our storage. See
-- lib/ebay.ts.
--
-- Deliberately separate from image_url: ingest upserts every card daily and
-- would flatten these. Nothing in ingest touches an ebay_* column, so a photo
-- found once survives until the photo job replaces it.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_photo_url     text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_listing_url   text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_listing_title text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_listing_price double precision;
-- When we last asked eBay. Also marks "asked and found nothing", so a rerun can
-- skip cards it already failed on rather than burning the API quota again.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ebay_photo_at      timestamp;

-- Human review of those photos (see /admin/photos).
--
-- No matcher can tell a good photo from a bad one — it can only tell whether the
-- TITLE is plausible. Whether the picture is sleeved, blurry, cropped, showing
-- both halves of a LEGEND card, or of the wrong printing entirely is a question
-- only eyes answer. 'good' | 'bad' | null (not yet looked at).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS photo_verdict      text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS photo_reviewed_at  timestamp;

-- Photos a human has rejected. Load-bearing: rejecting clears ebay_photo_url, so
-- without this the next `pnpm run photos` run would cheerfully find the same
-- listing again and put the same bad picture back. Keyed on the image URL rather
-- than the listing, because sellers relist.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS rejected_photo_urls text[];

-- The set's own code — OP05, EB01, ST26 — derived at ingest from the numbers of
-- the singles in the set (see lib/ingest.ts).
--
-- Mainly for sealed products: a booster box has no card number, so without this
-- "Awakening of the New Era - Booster Box Case" never says OP05 anywhere, which
-- is the first thing a One Piece buyer looks for. Singles already carry it inside
-- their number, so this just makes it available to everything in the set.
--
-- Null when no code dominates. Reprint sets like "Premium Booster -The Best-"
-- draw cards from OP01 through OP09; its most common prefix is OP05 with 21% of
-- the set, and stamping OP05 on that box would be a lie.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS set_code text;

-- Everything we search, lowercased into one blob. Token-AND against this is what
-- lets keywords come from different fields.
ALTER TABLE cards DROP COLUMN IF EXISTS search_text;
ALTER TABLE cards ADD COLUMN search_text text
  GENERATED ALWAYS AS (
    lower(
      COALESCE(name, '')       || ' ' ||
      COALESCE(clean_name, '') || ' ' ||
      COALESCE(group_name, '') || ' ' ||
      COALESCE(rarity, '')     || ' ' ||
      COALESCE(number, '')     || ' ' ||
      -- So "OP05 booster box" finds the box. A sealed product has no number, so
      -- without this the set code is unsearchable for exactly the products people
      -- search for it by.
      COALESCE(set_code, '')   || ' ' ||
      COALESCE(game, '')       || ' ' ||
      COALESCE(language, '')
    )
  ) STORED;

CREATE TABLE IF NOT EXISTS price_snapshots (
  product_id       integer NOT NULL REFERENCES cards(product_id) ON DELETE CASCADE,
  sub_type_name    text NOT NULL,
  date             date NOT NULL,
  market_price     double precision,
  low_price        double precision,
  mid_price        double precision,
  high_price       double precision,
  direct_low_price double precision,
  CONSTRAINT price_snapshots_product_id_sub_type_name_date_pk
    PRIMARY KEY (product_id, sub_type_name, date)
);

CREATE INDEX IF NOT EXISTS cards_game_idx        ON cards USING btree (game);
CREATE INDEX IF NOT EXISTS cards_game_single_idx ON cards USING btree (game, is_single);
CREATE INDEX IF NOT EXISTS cards_game_lang_idx   ON cards USING btree (game, language, is_single);
CREATE INDEX IF NOT EXISTS cards_tracked_idx     ON cards USING btree (tracked);
CREATE INDEX IF NOT EXISTS cards_number_idx      ON cards USING btree (upper(number));
CREATE INDEX IF NOT EXISTS cards_name_trgm       ON cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cards_search_trgm     ON cards USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS snap_date_idx         ON price_snapshots USING btree (date);
