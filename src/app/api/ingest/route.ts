import { NextRequest, NextResponse } from "next/server";
import { GAMES, GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { ingestGame, IngestResult } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds (capped to plan limit; Hobby = 60s)

/**
 * Daily ingestion endpoint, triggered by Vercel Cron (see vercel.json).
 *
 * Auth: when CRON_SECRET is set, requests must send
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Cron does this automatically. Manual runs must supply it too.
 *
 * Query params:
 *   ?game=pokemon|onepiece|riftbound  — ingest a single game (recommended,
 *                                        keeps each invocation under the time
 *                                        limit). Omit to ingest all games.
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
  const targets =
    gameParam && isGameSlug(gameParam) ? [GAME_BY_SLUG[gameParam]] : GAMES;

  const results: IngestResult[] = [];
  const errors: { game: string; error: string }[] = [];

  for (const game of targets) {
    try {
      results.push(await ingestGame(game));
    } catch (err) {
      errors.push({ game: game.slug, error: String(err) });
    }
  }

  return NextResponse.json(
    { ok: errors.length === 0, results, errors },
    { status: errors.length ? 207 : 200 },
  );
}
