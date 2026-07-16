import { money, percent } from "@/lib/format";

export interface MoverExample {
  name: string;
  from: number;
  to: number;
  pct: number;
}

/**
 * Explains how gains/losses are worked out, above the movers lists.
 *
 * People trade real money off these numbers, so this has to actually land — not
 * just technically exist. It leads with a worked example built from the real top
 * mover on screen, then three plain-sentence rules. The precise stuff (formula,
 * confidence weights, limits) stays available but folded away, so the honest
 * details are there without burying the point.
 */
export function MethodologyNote({
  windowDays,
  actualDays,
  minPrice,
  fromDate,
  toDate,
  example,
}: {
  windowDays: number;
  actualDays?: number;
  minPrice: number;
  fromDate?: string;
  toDate?: string;
  example?: MoverExample;
}) {
  const period = actualDays && actualDays !== windowDays ? actualDays : windowDays;
  const up = example ? example.pct >= 0 : true;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-base font-semibold text-white">
        How we work out the change
      </h3>
      <p className="mt-1 text-sm text-white/50">
        We check the price {period === 1 ? "yesterday" : `${period} days ago`}, then
        compare it with today.
      </p>

      {/* A real example, not a made-up one — this is the top card on screen. */}
      {example && (
        <div className="mt-4 rounded-xl bg-black/25 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Stat label={fromDate ?? `${period} days ago`} value={money(example.from)} />
            <span className="text-lg text-white/25">→</span>
            <Stat label={toDate ?? "today"} value={money(example.to)} />
            <span className="text-lg text-white/25">=</span>
            <span
              className={`rounded-lg px-3 py-2 text-lg font-semibold tabular-nums ${
                up
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {percent(example.pct)}
            </span>
          </div>
          <p className="mt-3 text-xs text-white/40">
            That&apos;s <span className="text-white/70">{example.name}</span> — the
            top card below. It {up ? "went up" : "went down"} by{" "}
            {money(Math.abs(example.to - example.from))}, which is{" "}
            {percent(example.pct)} of what it used to cost.
          </p>
        </div>
      )}

      {/* Three rules, one sentence each. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Rule icon="💵" title="Only real sales count">
          A price counts only if someone actually bought the card. What a seller{" "}
          <em>hopes</em> to get doesn&apos;t count.
        </Rule>
        <Rule icon="🪙" title="Cheap cards are skipped">
          A {minPrice === 5 ? "$1" : "40¢"} card going to{" "}
          {minPrice === 5 ? "$3" : "$1.20"} is a big jump, but it isn&apos;t news.
          We ignore anything under {money(minPrice)}.
        </Rule>
        <Rule icon="⚖️" title="Calm beats wild">
          If sellers can&apos;t agree what a card is worth, we trust it less and
          push it down. So a small % can sit above a big one.
        </Rule>
      </div>

      <details className="group mt-4">
        <summary className="cursor-pointer list-none text-xs font-medium text-white/40 hover:text-white/70">
          <span className="inline-block transition-transform group-open:rotate-90">
            ▸
          </span>{" "}
          The exact math, and what these numbers can&apos;t tell you
        </summary>

        <div className="mt-3 flex flex-col gap-4 text-xs leading-relaxed text-white/45">
          <div>
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-black/40 px-3 py-2 text-emerald-300/90">
              change % = (price today − price {period} days ago) ÷ price {period}{" "}
              days ago
            </code>
            <p className="mt-2">
              Price means TCGplayer&apos;s <strong>market price</strong> — worked
              out from real completed sales. Cards nobody has bought are left out
              of these lists entirely; you&apos;ll find them under
              &ldquo;Unconfirmed&rdquo;. We save every tracked card&apos;s price
              once a day, and each printing (Normal, Foil…) is counted separately.
            </p>
          </div>

          <div>
            <p className="mb-2">
              <strong className="text-white/60">&ldquo;Calm beats wild&rdquo;</strong>{" "}
              means we compare the cheapest and priciest copy on sale. If those are
              close, sellers agree and we trust the price. If the dearest is 10×
              the cheapest, nobody really knows. We multiply the change by:
            </p>
            <table className="w-full max-w-xs text-left">
              <thead className="text-white/35">
                <tr>
                  <th className="py-0.5 font-medium">Priciest ÷ cheapest</th>
                  <th className="py-0.5 font-medium">Counts for</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr><td className="py-0.5">under 2×</td><td className="text-emerald-400/80">100%</td></tr>
                <tr><td className="py-0.5">2× – 4×</td><td className="text-emerald-400/60">80%</td></tr>
                <tr><td className="py-0.5">4× – 10×</td><td className="text-amber-400/70">55%</td></tr>
                <tr><td className="py-0.5">over 10×</td><td className="text-rose-400/70">30%</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 text-white/60">Worth knowing:</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>
                These are <strong>TCGplayer sales only</strong> — not eBay or
                Japanese shops, where the same card can go for a different price.
              </li>
              <li>
                Sellers agreeing isn&apos;t the same as a card <em>selling</em>. We
                can&apos;t see how many copies actually sold.
              </li>
              <li>Prices are saved once a day, so moves within a day are invisible.</li>
              <li>
                <strong>This isn&apos;t advice.</strong> A big move is a reason to
                go look closer, not a reason to buy or sell.
              </li>
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] text-white/35">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-white/90">
        {value}
      </span>
    </span>
  );
}

function Rule({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">
          {icon}
        </span>
        <span className="text-sm font-medium text-white/85">{title}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-white/45">{children}</p>
    </div>
  );
}
