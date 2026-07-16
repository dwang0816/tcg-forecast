import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * eBay Marketplace Account Deletion / Closure Notification endpoint.
 *
 * eBay requires every production application to handle these before it will
 * enable the production keyset.
 *
 * GET  — the validation handshake. eBay calls with ?challenge_code=... and we
 *        must reply with sha256(challengeCode + verificationToken + endpointUrl)
 *        as hex. The endpoint URL must match EXACTLY what's registered with eBay,
 *        so it's configurable rather than derived from the request.
 * POST — an actual account-deletion notice. This app stores no eBay user data
 *        (it only reads public catalog/price data), so there is nothing to
 *        erase; we acknowledge with 200 as eBay requires.
 */

const ENDPOINT_URL =
  process.env.EBAY_DELETION_ENDPOINT_URL ??
  "https://tcg-forecast.vercel.app/api/ebay/deletion";

export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "EBAY_VERIFICATION_TOKEN is not configured" },
      { status: 500 },
    );
  }
  if (!challengeCode) {
    return NextResponse.json(
      { error: "Missing challenge_code query parameter" },
      { status: 400 },
    );
  }

  // Order is significant: challengeCode, then token, then the endpoint URL.
  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(token);
  hash.update(ENDPOINT_URL);

  return NextResponse.json(
    { challengeResponse: hash.digest("hex") },
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Log the notification id only — never the user data itself.
    const id =
      (body as { notification?: { notificationId?: string } })?.notification
        ?.notificationId ?? "unknown";
    console.log(`[ebay] account deletion notification received: ${id}`);
  } catch {
    // A malformed body still gets acknowledged; eBay only needs the 200.
  }
  return new NextResponse(null, { status: 200 });
}
