ALTER TABLE "cards" ADD COLUMN "tracked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_tracked_idx" ON "cards" USING btree ("tracked");