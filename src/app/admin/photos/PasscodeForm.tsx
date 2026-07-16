"use client";

import { useActionState } from "react";
import { submitPasscode } from "./actions";

export function PasscodeForm() {
  const [error, action, pending] = useActionState(submitPasscode, null);

  return (
    <form
      action={action}
      className="flex max-w-sm flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5"
    >
      <label htmlFor="passcode" className="text-sm font-medium text-white/70">
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        autoFocus
        className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/35"
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-white/20 bg-white/[0.08] py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/15 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
