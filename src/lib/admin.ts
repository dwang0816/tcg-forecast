import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Passcode gate for /admin.
 *
 * Deliberately small: one shared passcode in ADMIN_PASSCODE, no users, no
 * database. This guards a review queue for a personal project — the worst a
 * breach does is let someone mark a card's photo good or bad.
 *
 * Small doesn't mean sloppy, though:
 *  - The cookie holds an HMAC of a constant keyed by the passcode, never the
 *    passcode itself. Someone reading the cookie jar can't replay it anywhere
 *    else or learn the secret.
 *  - Comparisons are timing-safe. A plain === leaks the answer a character at a
 *    time to anyone patient enough to measure.
 *  - httpOnly so page scripts can't read it; sameSite=lax so another site can't
 *    ride the session with a cross-site form post.
 *
 * With no ADMIN_PASSCODE set, the gate stays SHUT rather than open. An admin page
 * that silently unlocks itself when a deploy forgets an env var is the classic
 * way this goes wrong.
 */

const COOKIE = "tcgf_admin";
const PAYLOAD = "tcg-forecast-admin-v1";

function tokenFor(passcode: string): string {
  return createHmac("sha256", passcode).update(PAYLOAD).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** Is the passcode configured at all? */
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE);
}

/** Does this request carry a valid admin cookie? */
export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_PASSCODE;
  if (!secret) return false;
  const got = (await cookies()).get(COOKIE)?.value;
  if (!got) return false;
  return safeEqual(got, tokenFor(secret));
}

/**
 * Check a submitted passcode and start a session.
 * Must be called from a Server Function — cookies can only be set where response
 * headers are still being written.
 */
export async function signIn(passcode: string): Promise<boolean> {
  const secret = process.env.ADMIN_PASSCODE;
  if (!secret) return false;
  if (!safeEqual(passcode, secret)) return false;
  (await cookies()).set(COOKIE, tokenFor(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
