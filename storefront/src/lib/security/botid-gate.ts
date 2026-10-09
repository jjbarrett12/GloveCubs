import { NextResponse } from "next/server";
import { checkBotId } from "botid/server";

export type BotIdGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Fail-closed BotID gate for public side-effect routes.
 *
 * Owner policy: ANY bot classification — including verified bots — is rejected
 * unless a future explicit allowlist is added here.
 */
export async function requireHumanBotId(opts?: {
  route?: string;
}): Promise<BotIdGateResult> {
  const verification = await checkBotId({
    advancedOptions: { checkLevel: "basic" },
  });

  // Reject bots AND verified bots. Do not treat verified bots as allowed.
  if (verification.isBot || verification.isVerifiedBot) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Access denied",
          code: "bot_rejected",
          route: opts?.route ?? null,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}
