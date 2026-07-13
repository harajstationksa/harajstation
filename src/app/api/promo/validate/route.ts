import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { validatePromo } from "@/lib/promo";
import { rateLimitGuard } from "@/lib/rate-limit";

/** Live promo-code check for the wallet UI (no redemption happens here). */
export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "promo-validate", 20, 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = String(body?.code ?? "");
  const check = await validatePromo(code, user.id);
  if (!check.ok) {
    return NextResponse.json({ valid: false, error: check.error });
  }
  return NextResponse.json({ valid: true, percent: check.promo.percent });
}
