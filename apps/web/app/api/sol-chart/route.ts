import { NextResponse } from "next/server";

export const revalidate = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // F-104 (audit Pass 2): validate `days` strictly before passing to the
  // upstream URL. Today CoinGecko ignores unknown params, but templating
  // a user-influenced value into a URL string is the same idiom as the
  // ones that turn into SSRF / header-injection bugs later. Whitelist
  // digits, cap to 4 chars (max useful = "365"), default to "7".
  const daysParam = searchParams.get("days") ?? "7";
  const days = /^[0-9]{1,4}$/.test(daysParam) ? daysParam : "7";

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    }

    const upstream = new URL("https://api.coingecko.com/api/v3/coins/solana/market_chart");
    upstream.searchParams.set("vs_currency", "usd");
    upstream.searchParams.set("days", days);

    const res = await fetch(upstream, {
      headers,
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });

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
