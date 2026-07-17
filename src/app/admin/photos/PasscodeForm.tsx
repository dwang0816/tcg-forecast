"use client";

import { useActionState } from "react";
import { submitPasscode } from "./actions";
import { Mark } from "@/components/Logo";

export function PasscodeForm() {
  const [error, action, pending] = useActionState(submitPasscode, null);

  return (
    <form
      action={action}
      className="flex max-w-sm flex-col gap-3 rounded-xl border border-edge bg-panel p-5"
    >
      <Mark size={28} className="mb-1" />
      <label
        htmlFor="passcode"
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint"
      >
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        autoFocus
        className="rounded-lg border border-edge bg-graphite px-3 py-2 font-mono text-sm text-ink outline-none transition-colors focus:border-gold/50"
      />
      {error && <p className="font-mono text-xs text-down-bright">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-gold/40 bg-gold/10 py-2 text-sm font-semibold text-gold-bright transition-colors hover:bg-gold/20 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
