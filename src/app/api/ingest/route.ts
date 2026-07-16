import { NextRequest, NextResponse } from "next/server";
import { allGameLanguages, isGameSlug, parseLanguage } from "@/lib/games";
import { ingestGame, IngestResult } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds (capped to plan limit; Hobby = 60s)

/**
 * Daily ingestion endpoint, triggered by GitHub Actions (see ingest.yml).
 *
 * Auth: when CRON_SECRET is set, requests must send
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Query params:
 *   ?game=pokemon|onepiece|riftbound  — ingest a single game (recommended,
 *                                        keeps each invocation under the time
 *                                        limit). Omit to ingest everything.
 *   ?language=EN|JP                   — restrict to one language. Only Pokémon
 *                                        has a JP catalog on TCGplayer.
 *   ?force=1                          — re-pull even if we already hold this
 *                                        day. For repairing a bad day by hand;
 *                                        the schedule should never set it, or
 *                                        we're back to hammering tcgcsv 6x.
 *
 * Normally a run whose day is already banked returns skipped:true without
 * fetching the catalog — tcgcsv asks for one pull per 24h, and five of our six
 * daily runs would otherwise re-fetch identical data.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const gameParam = req.nextUrl.searchParams.get("game");
  const langParam = req.nextUrl.searchParams.get("language");
  const force = req.nextUrl.searchParams.get("force") === "1";

  let targets = allGameLanguages();
  if (gameParam && isGameSlug(gameParam)) {
    targets = targets.filter((t) => t.game.slug === gameParam);
  }
  if (langParam) {
    const lang = parseLanguage(langParam.toUpperCase());
    targets = targets.filter((t) => t.language === lang);
  }

  const results: IngestResult[] = [];
  const errors: { game: string; language: string; error: string }[] = [];

  for (const { game, language } of targets) {
    try {
      results.push(await ingestGame(game, language, undefined, { force }));
    } catch (err) {
      errors.push({ game: game.slug, language, error: String(err) });
    }
  }

  return NextResponse.json(
    { ok: errors.length === 0, results, errors },
    { status: errors.length ? 207 : 200 },
  );
}
