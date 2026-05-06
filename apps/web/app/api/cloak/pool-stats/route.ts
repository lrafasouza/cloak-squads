import { getPoolStats } from "@/lib/cloak-anonymity";
import { NextResponse } from "next/server";

// In-memory cache: map mint → { stats, fetchedAt }
const cache = new Map<string, { stats: Awaited<ReturnType<typeof getPoolStats>>; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get("mint") ?? undefined;
  const cacheKey = mint ?? "SOL";

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cached.stats,
      poolDepthLamports: cached.stats.poolDepthLamports.toString(),
      cached: true,
    });
  }

  try {
    const stats = await getPoolStats(mint);
    cache.set(cacheKey, { stats, fetchedAt: Date.now() });
    return NextResponse.json({
      ...stats,
      poolDepthLamports: stats.poolDepthLamports.toString(),
      cached: false,
    });
  } catch (err) {
    console.error("[pool-stats] error:", err);
    return NextResponse.json({ error: "Could not fetch pool stats." }, { status: 502 });
  }
}
