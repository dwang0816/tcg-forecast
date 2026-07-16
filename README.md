# TCG Forecast 📈

Price-movement tracker for **Pokémon**, **One Piece**, and **Riftbound**
trading cards.

- **Per game:** top 20 **singles** rising and top 20 falling, over 24h / 7d / 30d.
- **All games combined:** top 20 **sealed products** (boxes, packs, decks) rising
  and falling.
- **Most Valuable** singles per game.

Singles vs. sealed products are separated automatically at ingest time (singles
carry a card rarity/number; sealed products don't).

Built with Next.js (App Router) + Drizzle + Railway Postgres, deployed on Vercel.

---

## How it works

```
GitHub Actions (6x daily, 20:00–01:00 UTC)
        │  curl /api/ingest?game=… (one call per game)
        │  Only the run that finds new data pulls; the rest skip.
        ▼
/api/ingest ──fetch──► tcgcsv.com (TCGplayer catalog + prices)
        │
        ▼
Railway Postgres
  cards            — one row per TCGplayer product (card metadata)
  price_snapshots  — one row per (product, subtype, day), back to 2024-07
        │
        ▼
Next.js pages  /  ·  /pokemon  ·  /onepiece  ·  /riftbound  ·  /products
```

**Update cadence.** The ingest runs **6× a day, one hour apart (20:00–01:00
UTC)**. The upstream source ([tcgcsv.com](https://tcgcsv.com), a free mirror of
TCGplayer market prices) only refreshes **once per day around 20:00 UTC**, so
these runs aren't for intraday granularity — they reliably *catch* that daily
update (and re-fetch if a run lands before it or gets skipped). Snapshots are
keyed by day and **upserted**, so the freshest run of the day wins. Trends are
computed by diffing today's snapshot against an earlier one — we keep our own
history.

> Want genuine intraday price movement? That requires a source that updates more
> than once a day (generally paid). The schema already supports it — you'd swap
> the ingest source and key snapshots by timestamp instead of date.

**Trends build over time.** On a brand-new database there's no history yet, so
gainers/losers are empty until the second daily run (24 h), and the 7 d / 30 d
windows fill in as days accumulate. The **Most Valuable** view works from the
very first ingest. While a window is still filling, the app compares against the
oldest snapshot it has and labels the *actual* period shown.

---

## Local setup

Requires Node 18+.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Postgres database** on Railway (<https://railway.app> → New →
   Database → Add PostgreSQL). From the Postgres service → **Variables**, copy
   **`DATABASE_PUBLIC_URL`** — *not* `DATABASE_URL`, which is a private
   `*.railway.internal` host that only resolves inside Railway's network.

3. **Create `.env.local`** (copy from `.env.example`):
   ```bash
   DATABASE_URL="postgresql://postgres:…@….proxy.rlwy.net:12345/railway"
   CRON_SECRET="$(openssl rand -hex 32)"
   ```

4. **Create the tables**:
   ```bash
   npm run schema
   ```
   Use this, not `drizzle-kit push`. The `search_text` column is a generated
   column and its trigram indexes can't be expressed in `src/db/schema.ts`, so
   pushing from the Drizzle schema builds a database where search silently
   returns nothing. `scripts/schema.sql` is the source of truth — keep it in
   sync by hand when `schema.ts` changes.

5. **Pull the first day of prices**:
   ```bash
   npm run ingest            # all three games
   # or one at a time:
   npm run ingest riftbound
   ```

6. **Run the app**:
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000>. You'll see the Most Valuable list immediately;
   run `npm run ingest` again on another day to see movers populate.

---

## Deploy to Vercel

1. **Push this repo to GitHub.**

2. **Import the repo into Vercel** (<https://vercel.com/new>). The Next.js preset
   is auto-detected — no config needed.

3. **Add environment variables** in Vercel (Project → Settings → Environment
   Variables), for all environments:
   - `DATABASE_URL` — Railway's `DATABASE_PUBLIC_URL`
   - `CRON_SECRET` — the same random value you generated locally

   Avoid the Vercel Marketplace database integrations here: they take ownership
   of `DATABASE_URL` and the dashboard won't let you edit it, so pointing the app
   at your own database means detaching the integration first.

4. **Create the tables on the production DB** (once). Easiest from your machine
   with the production `DATABASE_URL` in `.env.local`:
   ```bash
   npm run db:push
   ```

5. **Deploy.** Vercel builds and hosts it.

### Scheduling the daily ingest

Ingestion is triggered by **GitHub Actions** (`.github/workflows/ingest.yml`),
which works on Vercel's free Hobby plan (whose cron is limited to 2 jobs/day)
and calls each game separately to stay under the function time limit.

Add two **repository secrets** (GitHub → Settings → Secrets and variables →
Actions):
- `INGEST_BASE_URL` — your deployed URL, e.g. `https://your-app.vercel.app`
- `CRON_SECRET` — the same value as in Vercel

The workflow runs 6× a day (20:00–01:00 UTC, hourly). You can also trigger it
manually from the **Actions** tab (“Run workflow”) to seed data immediately
after deploying.

> **Alternative — Vercel Cron (Pro plan).** If you're on Vercel Pro, skip GitHub
> Actions and add a `vercel.json` instead:
> ```json
> {
>   "crons": [
>     { "path": "/api/ingest?game=pokemon",  "schedule": "0 21 * * *" },
>     { "path": "/api/ingest?game=onepiece", "schedule": "10 21 * * *" },
>     { "path": "/api/ingest?game=riftbound", "schedule": "20 21 * * *" }
>   ]
> }
> ```
> Vercel Cron automatically sends the `Authorization: Bearer $CRON_SECRET`
> header. (Hobby allows only 2 cron jobs, so the per-game split needs Pro.)

---

## Data model

| table | key | notable columns |
| --- | --- | --- |
| `cards` | `product_id` | `game`, `group_name` (set), `name`, `image_url`, `url`, `rarity`, `number`, `is_single` (card vs. sealed) |
| `price_snapshots` | `(product_id, sub_type_name, date)` | `market_price`, `low/mid/high_price`, `direct_low_price` |

`sub_type_name` distinguishes printings such as `Normal` vs `Foil`, which carry
independent prices.

## Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | start the dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm run ingest [game]` | pull prices now (all games, or one) |
| `npm run db:push` | create/update tables on the DB from the schema |
| `npm run db:generate` | generate a SQL migration into `drizzle/` |
| `npm run db:migrate` | apply generated migrations |
| `npm run db:studio` | open Drizzle Studio to browse the data |

## Data source & attribution

Prices come from [tcgcsv.com](https://tcgcsv.com), a free daily mirror of
TCGplayer's public catalog and market prices. This project is not affiliated
with TCGplayer, The Pokémon Company, Bandai, or Riot Games. Respect tcgcsv's
[usage guidelines](https://tcgcsv.com/docs) — the ingest client already
identifies itself via User-Agent and stays well under the request budget.
