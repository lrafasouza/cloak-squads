import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) {
      return NextResponse.json({ price: null }, { status: 200 });
    }
    const data = (await res.json()) as { solana?: { usd?: number } };
    const price = data.solana?.usd ?? null;
    return NextResponse.json(
      { price },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json({ price: null }, { status: 200 });
  }
}
