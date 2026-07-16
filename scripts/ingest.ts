// Local / manual ingestion runner.
//   npm run ingest                    -> every game/language we can ingest
//   npm run ingest pokemon            -> both languages of one game
//   npm run ingest pokemon JP         -> one game, one language
//   npm run ingest pokemon EN force   -> re-pull a day we already hold
//
// Without `force` this skips a day that's already banked, same as the cron —
// tcgcsv asks for one pull per 24h. Use force to repair a bad day.
// Loads DATABASE_URL from .env.local.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  // Import lazily so dotenv runs before db/index.ts validates DATABASE_URL.
  const { allGameLanguages, isGameSlug, parseLanguage } = await import("../src/lib/games");
  const { ingestGame } = await import("../src/lib/ingest");

  const gameArg = process.argv[2];
  const langArg = process.argv[3] === "force" ? undefined : process.argv[3];
  const force = process.argv.includes("force");

  let targets = allGameLanguages();
  if (gameArg && isGameSlug(gameArg)) {
    targets = targets.filter((t) => t.game.slug === gameArg);
  }
  if (langArg) {
    const lang = parseLanguage(langArg.toUpperCase());
    targets = targets.filter((t) => t.language === lang);
  }

  for (const { game, language } of targets) {
    const start = Date.now();
    process.stdout.write(`Ingesting ${game.name} (${language})... `);
    const result = await ingestGame(game, language, undefined, { force });
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      result.skipped
        ? `already have ${result.date} — skipped (${secs}s). Pass 'force' to re-pull.`
        : `done in ${secs}s — ${result.cards} cards, ${result.tracked} tracked, ${result.snapshots} snapshots (${result.date})`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
