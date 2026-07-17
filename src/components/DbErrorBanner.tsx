import { DbErrorInfo } from "@/lib/safe";

export function DbErrorBanner({ error }: { error: DbErrorInfo }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-down/30 bg-down/[0.06] px-6 py-12 text-center">
      <span className="text-3xl">🛠️</span>
      <h2 className="font-display text-lg font-bold tracking-tight text-down-bright">
        Almost there — {error.message}
      </h2>
      <p className="max-w-lg text-sm text-ink-dim">{error.hint}</p>
      <p className="max-w-lg font-mono text-[11px] text-ink-faint">
        Check{" "}
        <code className="rounded bg-graphite px-1 text-ink-dim">/api/health</code>{" "}
        for a detailed status readout.
      </p>
    </div>
  );
}
