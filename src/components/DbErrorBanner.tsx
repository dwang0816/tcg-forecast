import { DbErrorInfo } from "@/lib/safe";

export function DbErrorBanner({ error }: { error: DbErrorInfo }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-6 py-12 text-center">
      <span className="text-3xl">🛠️</span>
      <h2 className="text-lg font-medium text-amber-200">
        Almost there — {error.message}
      </h2>
      <p className="max-w-lg text-sm text-white/50">{error.hint}</p>
      <p className="max-w-lg text-xs text-white/30">
        Check <code className="rounded bg-white/10 px-1">/api/health</code> for a
        detailed status readout.
      </p>
    </div>
  );
}
