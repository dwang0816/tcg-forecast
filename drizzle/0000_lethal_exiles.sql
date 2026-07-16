CREATE TABLE "cards" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"category_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"name" text NOT NULL,
	"clean_name" text,
	"image_url" text,
	"url" text,
	"rarity" text,
	"number" text,
	"is_single" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"product_id" integer NOT NULL,
	"sub_type_name" text NOT NULL,
	"date" date NOT NULL,
	"market_price" double precision,
	"low_price" double precision,
	"mid_price" double precision,
	"high_price" double precision,
	"direct_low_price" double precision,
	CONSTRAINT "price_snapshots_product_id_sub_type_name_date_pk" PRIMARY KEY("product_id","sub_type_name","date")
);
--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_product_id_cards_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."cards"("product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_game_idx" ON "cards" USING btree ("game");--> statement-breakpoint
CREATE INDEX "cards_game_single_idx" ON "cards" USING btree ("game","is_single");--> statement-breakpoint
CREATE INDEX "snap_date_idx" ON "price_snapshots" USING btree ("date");