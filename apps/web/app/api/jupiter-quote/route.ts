import { enforceIpAndWalletLimits } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const rawIp = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (rawIp.split(",")[0] ?? rawIp).trim();
  if (
    !(await enforceIpAndWalletLimits({
      ip,
      pubkey: auth.publicKey,
      scope: "swap-quote",
      ipLimit: 30,
      walletLimit: 120,
    }))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams.toString();
  const targetUrl = `https://api.jup.ag/swap/v2/order?${searchParams}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Jupiter API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/jupiter-quote] failed:", error);
    return NextResponse.json({ error: "Failed to fetch from Jupiter" }, { status: 500 });
  }
}
