// Local / manual ingestion runner.
//   npm run ingest            -> ingest all games
//   npm run ingest pokemon    -> ingest a single game
// Loads DATABASE_URL from .env.local.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  // Import lazily so dotenv runs before db/index.ts validates DATABASE_URL.
  const { GAMES, GAME_BY_SLUG, isGameSlug } = await import("../src/lib/games");
  const { ingestGame } = await import("../src/lib/ingest");

  const arg = process.argv[2];
  const targets = arg && isGameSlug(arg) ? [GAME_BY_SLUG[arg]] : GAMES;

  for (const game of targets) {
    const start = Date.now();
    process.stdout.write(`Ingesting ${game.name}... `);
    const result = await ingestGame(game);
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `done in ${secs}s — ${result.cards} cards, ${result.tracked} tracked, ${result.snapshots} snapshots (${result.date})`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
