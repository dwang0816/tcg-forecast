import Link from "next/link";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { isAdmin, adminConfigured } from "@/lib/admin";
import { GAME_BY_SLUG, allGameLanguages, type Language } from "@/lib/games";
import { getLastUpdated } from "@/lib/tcgcsv";
import { safeLoad } from "@/lib/safe";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { PasscodeForm } from "../photos/PasscodeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingest — TCG Forecast", robots: { index: false } };

/**
 * When a human last read this page against the code and agreed it was true.
 *
 * Bump it when you change .github/workflows/ingest.yml, the /api/ingest route, or
 * ingestGame(). It is a claim about attention, not about the code — nothing
 * enforces it, and that's the point: a date that only moves when someone actually
 * looks is worth more than one that moves on every deploy.
 *
 * The table above the prose is the counterweight. It reads the database live, so
 * if this page ever starts lying about the schedule, the "banked" column is where
 * you'll see it first.
 */
const REVIEWED = "2026-07-17";

/**
 * The six UTC hours in ingest.yml, written out for display.
 *
 * Duplicated from the workflow rather than parsed out of it: the yml isn't
 * readable from a Vercel function, and a doc that silently renders nothing when
 * the file moves is worse than one that's honestly hand-copied. If these
 * disagree with the cron lines, the yml is right and this is stale.
 */
const SCHEDULE = ["20:00", "21:00", "22:00", "23:00", "00:00", "01:00"];

interface Banked {
  game: string;
  language: Language;
  date: string | null;
  rows: number;
}

export default async function AdminIngestPage() {
  if (!adminConfigured()) {
    return (
      <Shell>
        <p className="rounded-xl border border-down/30 bg-down/[0.07] px-4 py-3 text-sm leading-relaxed text-ink-dim">
          <strong className="font-semibold text-down-bright">
            ADMIN_PASSCODE isn&apos;t set.
          </strong>{" "}
          Add it to your environment (and to Vercel) and redeploy. Until then this
          page stays locked — it won&apos;t fall open just because the variable is
          missing.
        </p>
      </Shell>
    );
  }

  if (!(await isAdmin())) {
    return (
      <Shell>
        <PasscodeForm />
      </Shell>
    );
  }

  const { data, error } = await safeLoad(async () => {
    const db = getDb();
    const rowsOf = <T,>(r: unknown) => (r as { rows?: T[] }).rows ?? [];

    // One query per game/language, mirroring the `prev` CTE in haveCompleteDay:
    // each is bounded to a single game and a single date, so it stays an index
    // scan. A single GROUP BY game over the whole join would be a walk of all
    // 8.6M snapshot rows to answer a question about four of them.
    const banked = await Promise.all(
      allGameLanguages().map(async ({ game, language }) => {
        const res = await db.execute(sql`
          WITH latest AS (
            SELECT max(s.date) AS d
            FROM price_snapshots s
            JOIN cards c ON c.product_id = s.product_id
            WHERE c.game = ${game.slug} AND c.language = ${language}
          )
          SELECT (SELECT d FROM latest)::text AS date, count(*)::int AS rows
          FROM price_snapshots s
          JOIN cards c ON c.product_id = s.product_id
          WHERE c.game = ${game.slug}
            AND c.language = ${language}
            AND s.date = (SELECT d FROM latest)
        `);
        const row = rowsOf<{ date: string | null; rows: number }>(res)[0];
        return {
          game: game.slug,
          language,
          date: row?.date ?? null,
          rows: row?.rows ?? 0,
        } satisfies Banked;
      }),
    );

    // What tcgcsv says it last published. The whole point of the table: "we hold
    // the day they published" is the only statement that actually proves the cron
    // ran. Null when they're unreachable — which is a fact about them, not a
    // failure of this page, so it degrades to showing dates without a verdict.
    const published = await getLastUpdated();
    return { banked, published };
  });

  if (error) {
    return (
      <Shell>
        <DbErrorBanner error={error} />
      </Shell>
    );
  }
  if (!data) return null;

  const { banked, published } = data;
  const behind = published
    ? banked.filter((b) => b.date !== published).length
    : 0;

  return (
    <Shell>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">
            Right now
          </h2>
          <p className="font-mono text-[11px] text-ink-faint">
            live from the database on every load
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-edge text-ink-faint">
                <Th>Catalog</Th>
                <Th>Latest day banked</Th>
                <Th className="text-right">Rows that day</Th>
                <Th className="text-right">State</Th>
              </tr>
            </thead>
            <tbody>
              {banked.map((b) => {
                const name = GAME_BY_SLUG[b.game as keyof typeof GAME_BY_SLUG]?.name ?? b.game;
                const current = published != null && b.date === published;
                return (
                  <tr key={`${b.game}-${b.language}`} className="border-b border-edge/50 last:border-0">
                    <Td>
                      <span className="text-ink">{name}</span>{" "}
                      <span className="font-mono text-[11px] text-ink-faint">{b.language}</span>
                    </Td>
                    <Td className="font-mono tabular-nums text-ink-dim">
                      {b.date ?? "never"}
                    </Td>
                    <Td className="text-right font-mono tabular-nums text-ink-dim">
                      {b.rows.toLocaleString()}
                    </Td>
                    <Td className="text-right">
                      {published == null ? (
                        <span className="font-mono text-[11px] text-ink-faint">—</span>
                      ) : current ? (
                        <span className="font-mono text-[11px] text-up-bright">current</span>
                      ) : (
                        <span className="font-mono text-[11px] text-down-bright">behind</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs leading-relaxed text-ink-faint">
          {published == null ? (
            <>
              tcgcsv&apos;s <Code>last-updated.txt</Code> didn&apos;t answer just now, so
              there&apos;s nothing to compare these dates against. That alone isn&apos;t
              alarming — the ingest treats an unreachable source the same way, by
              falling back to today&apos;s UTC date. Reload before reading anything
              into it.
            </>
          ) : behind === 0 ? (
            <>
              tcgcsv last published <Code>{published}</Code>, and every catalog holds
              that day. The cron is doing its job; nothing needs you.
            </>
          ) : (
            <>
              tcgcsv last published <Code>{published}</Code>, but{" "}
              <strong className="font-medium text-down-bright">
                {behind} of {banked.length}
              </strong>{" "}
              {behind === 1 ? "catalog is" : "catalogs are"} short of it. If that
              hasn&apos;t cleared within a few hours of 20:00 UTC, check the workflow&apos;s
              last run in the Actions tab before assuming the data is wrong.
            </>
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-ink">
          What the cron actually does
        </h2>

        <ol className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
          <Step n={1}>
            <strong className="font-medium text-ink">
              GitHub Actions wakes up six times a day
            </strong>{" "}
            — {SCHEDULE.join(", ")} UTC — from{" "}
            <Code>.github/workflows/ingest.yml</Code>. Not Vercel: the Hobby plan
            caps crons at two a day, and Actions has no such limit. There&apos;s no{" "}
            <Code>vercel.json</Code>, so this workflow is the only schedule in the
            project.
          </Step>

          <Step n={2}>
            <strong className="font-medium text-ink">Each run calls the deployed app</strong>{" "}
            at <Code>/api/ingest</Code>, once per catalog, four calls in sequence:
            Pokémon EN, Pokémon JP, One Piece EN, Riftbound EN. One at a time so no
            single call runs into the function time limit. It sends{" "}
            <Code>Authorization: Bearer $CRON_SECRET</Code>; the route rejects
            anything else, so the endpoint isn&apos;t a button strangers can press.
          </Step>

          <Step n={3}>
            <strong className="font-medium text-ink">The route asks tcgcsv what day it&apos;s on</strong>{" "}
            by fetching <Code>last-updated.txt</Code> — a few bytes. That answer, not
            our own clock, dates the snapshot. It matters because runs before the
            ~20:00 refresh return <em>yesterday&apos;s</em> prices, and stamping those
            with today&apos;s date would invent a phantom day and break movers.
          </Step>

          <Step n={4}>
            <strong className="font-medium text-ink">If that day is already banked, it stops there</strong>{" "}
            and returns <Code>skipped: true</Code> without downloading the catalog.
            This is what happens on five of the six runs. &quot;Banked&quot; means the day
            exists <em>and</em> has at least 90% of the previous day&apos;s row count — a
            run that died halfway through would otherwise look finished forever and
            leave that day permanently short.
          </Step>

          <Step n={5}>
            <strong className="font-medium text-ink">The one run that finds a new day does the real work</strong>
            : every group&apos;s products and prices, upserted into <Code>cards</Code>,
            with one <Code>price_snapshots</Code> row per (product, subtype, day) for
            tracked cards. Then, only if something was actually written, it calls{" "}
            <Code>revalidateTag(PRICES_TAG, &quot;max&quot;)</Code> — the browsing pages cache
            for a day, so this is what makes new prices appear at all. The{" "}
            <Code>&quot;max&quot;</Code> profile serves the next visitor yesterday&apos;s page
            instantly and refreshes behind them, rather than making whoever arrives
            first wait on a scan of the history table.
          </Step>
        </ol>

        <p className="text-xs leading-relaxed text-ink-faint">
          So the six runs are six cheap checks, not six downloads. They exist to{" "}
          <em>catch</em> a once-daily refresh whose exact time isn&apos;t promised, and
          because Actions quietly skips runs when it&apos;s busy. Six tries make missing
          a day nearly impossible; the skip logic makes five of them nearly free.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-ink">
          If you change something
        </h2>
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink-dim">
          <Bullet>
            <Code>?force=1</Code> makes a run re-download even if the day is banked.
            It&apos;s the by-hand repair tool for a bad day — the schedule must never
            set it, or the six runs go back to hammering tcgcsv, who ask plainly for
            one pull per 24 hours.
          </Bullet>
          <Bullet>
            The workflow needs two repository secrets:{" "}
            <Code>INGEST_BASE_URL</Code> (no trailing slash) and{" "}
            <Code>CRON_SECRET</Code>, which must match the Vercel env var of the same
            name. Rotate one without the other and every run 401s.
          </Bullet>
          <Bullet>
            Adding a game or language to <Code>lib/games.ts</Code> is not enough —
            the yml&apos;s loop lists its targets literally. A catalog missing from that
            list simply never ingests, and nothing anywhere reports an error, because
            no run ever asked for it.
          </Bullet>
          <Bullet>
            You can trigger a run by hand from the Actions tab (the workflow has{" "}
            <Code>workflow_dispatch</Code>) — the honest way to test a change to any
            of this.
          </Bullet>
        </ul>
      </section>

      <p className="border-t border-edge pt-4 font-mono text-[11px] leading-relaxed text-ink-faint">
        Last reviewed against the code on{" "}
        <span className="text-ink-dim">{REVIEWED}</span>. Sources:{" "}
        <Code>.github/workflows/ingest.yml</Code>,{" "}
        <Code>src/app/api/ingest/route.ts</Code>, <Code>src/lib/ingest.ts</Code>.
        Change any of those and this prose is a guess until someone bumps the date
        in <Code>src/app/admin/ingest/page.tsx</Code>.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="kicker mb-1">Internal · ingest</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          <span className="text-ink">How prices</span>{" "}
          <span className="text-ink-faint">get here</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
          Every price on this site arrives through one scheduled job. This page is
          what it does and why it&apos;s built that way — written down so a change
          months from now starts from the reasoning rather than from the code.{" "}
          <Link href="/admin/photos" className="text-gold-bright underline-offset-2 hover:underline">
            Photo review
          </Link>{" "}
          is the other half of the admin.
        </p>
      </div>
      {children}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-hi font-mono text-[11px] tabular-nums text-ink-faint">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
      <span>{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-graphite px-1 py-0.5 font-mono text-[11px] text-ink-dim">
      {children}
    </code>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.15em] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
