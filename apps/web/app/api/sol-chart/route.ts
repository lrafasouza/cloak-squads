import { NextResponse } from "next/server";

export const revalidate = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = searchParams.get("days") ?? "7";

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    }

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=${days}`,
      {
        headers,
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 300 },
      },
    );

    if (!res.ok) {
      return NextResponse.json({ prices: [] }, { status: 200 });
    }

    const data = (await res.json()) as {
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    };

    return NextResponse.json(
      { prices: data.prices },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ prices: [] }, { status: 200 });
  }
}
