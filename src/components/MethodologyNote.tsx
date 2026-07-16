import { money } from "@/lib/format";

/**
 * Explains exactly how gains/losses are computed, shown above the movers lists.
 * People trade real money off these numbers, so the method — including the parts
 * that are only proxies — should be visible rather than buried in code.
 */
export function MethodologyNote({
  windowDays,
  actualDays,
  minPrice,
  fromDate,
  toDate,
}: {
  windowDays: number;
  actualDays?: number;
  minPrice: number;
  fromDate?: string;
  toDate?: string;
}) {
  const period =
    actualDays && actualDays !== windowDays ? actualDays : windowDays;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white/80">
        How these gains and losses are calculated
      </h3>

      <div className="mt-3 overflow-x-auto">
        <code className="block whitespace-nowrap rounded-lg bg-black/40 px-3 py-2 text-xs text-emerald-300/90">
          change % = (market price now − market price {period} days ago) ÷ market
          price {period} days ago
        </code>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5 text-xs leading-relaxed text-white/50">
        <li>
          <span className="text-white/70">Price = what actually sold.</span> We
          use TCGplayer&apos;s <em>market price</em>, which is based on completed
          sales — not what sellers are asking. Cards with no confirmed sales are
          excluded from these lists entirely (they&apos;re under
          &ldquo;Unconfirmed&rdquo;), because an asking price isn&apos;t evidence
          of value.
        </li>
        <li>
          <span className="text-white/70">Both ends are real snapshots.</span> We
          record every tracked card&apos;s price once a day and compare the
          latest against the closest snapshot to {windowDays} day
          {windowDays === 1 ? "" : "s"} earlier
          {fromDate && toDate ? ` (here: ${fromDate} → ${toDate})` : ""}. If we
          don&apos;t have that much history yet, we compare against the oldest
          one we have and label the true period — never a guess.
        </li>
        <li>
          <span className="text-white/70">Each printing is separate.</span>{" "}
          Normal, Foil and other variants are tracked independently — they&apos;re
          different cards to a buyer.
        </li>
        <li>
          <span className="text-white/70">Noise floor.</span> Cards worth under{" "}
          {money(minPrice)} at the start of the period are excluded — a $0.40
          card ticking to $1.20 is +200% and means nothing.
        </li>
        <li>
          <span className="text-white/70">
            Ranked by change × confidence, not raw %.
          </span>{" "}
          A violent swing on a card nobody agrees the price of ranks below a
          steadier move on a liquid one — so you will sometimes see a smaller
          percentage listed above a bigger one. That&apos;s deliberate.
        </li>
      </ul>

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-white/45 hover:text-white/70">
          <span className="inline-block transition-transform group-open:rotate-90">
            ▸
          </span>{" "}
          How confidence is scored, and what these numbers can&apos;t tell you
        </summary>

        <div className="mt-3 flex flex-col gap-3 text-xs leading-relaxed text-white/45">
          <div>
            <p className="mb-2">
              Confidence comes from the <strong>spread</strong> between the
              lowest and highest current listing. A tight spread means sellers
              agree on the price; a 10× spread means nobody knows what it&apos;s
              worth. The change is multiplied by:
            </p>
            <table className="w-full max-w-xs text-left">
              <thead className="text-white/35">
                <tr>
                  <th className="py-0.5 font-medium">Spread (high ÷ low)</th>
                  <th className="py-0.5 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr>
                  <td className="py-0.5">under 2×</td>
                  <td className="text-emerald-400/80">1.0</td>
                </tr>
                <tr>
                  <td className="py-0.5">2× – 4×</td>
                  <td className="text-emerald-400/60">0.8</td>
                </tr>
                <tr>
                  <td className="py-0.5">4× – 10×</td>
                  <td className="text-amber-400/70">0.55</td>
                </tr>
                <tr>
                  <td className="py-0.5">over 10×</td>
                  <td className="text-rose-400/70">0.3</td>
                </tr>
                <tr>
                  <td className="py-0.5">unknown</td>
                  <td className="text-white/40">0.5</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 text-white/60">Known limits — read these:</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>
                <strong>TCGplayer only.</strong> Market price reflects sales on
                TCGplayer. It does not include eBay, Cardmarket, or Japanese
                marketplaces, where the same card can trade differently.
              </li>
              <li>
                <strong>Spread is a proxy, not volume.</strong> It measures
                whether sellers <em>agree</em>, not how many copies actually
                sold. We have no sales-volume data, so a card can look confident
                on two tightly-priced listings.
              </li>
              <li>
                <strong>Daily resolution.</strong> Prices are captured once a day
                (the source publishes ~20:00 UTC). Intraday movement is invisible
                to us.
              </li>
              <li>
                <strong>Not advice.</strong> A big move is a starting point for
                your own research, not a reason to buy or sell.
              </li>
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
