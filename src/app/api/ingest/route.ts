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
      results.push(await ingestGame(game, language));
    } catch (err) {
      errors.push({ game: game.slug, language, error: String(err) });
    }
  }

  return NextResponse.json(
    { ok: errors.length === 0, results, errors },
    { status: errors.length ? 207 : 200 },
  );
}
