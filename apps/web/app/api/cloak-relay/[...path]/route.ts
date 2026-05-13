import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_CLOAK_RELAY_URL = "https://api.devnet.cloak.ag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function relayBaseUrl() {
  return (process.env.NEXT_PUBLIC_CLOAK_RELAY_URL ?? DEFAULT_CLOAK_RELAY_URL).replace(/\/$/, "");
}

// Block path segments that URL normalization would resolve outside the
// relay base, or that try to inject a host-change.
function isSafeSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  return !/[\x00-\x1f]/.test(segment);
}

async function proxyRelayRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path.every(isSafeSegment)) {
    return new NextResponse("Invalid path", { status: 400 });
  }
  const upstream = new URL(`${relayBaseUrl()}/${path.join("/")}`);
  upstream.search = req.nextUrl.search;

  // F-107 (audit Pass 2): build outbound headers from a strict allowlist.
  // Today Node's fetch does not forward Cookie / Authorization cross-origin,
  // but a future runtime change could leak session-cookie / wallet-auth
  // tokens to the relay. Build outbound Headers only from the allowlist
  // (Content-Type, Accept) — anything else from inbound is intentionally
  // discarded.
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("Accept", accept);
  // Defensive: explicitly clear any sensitive header in case a future
  // refactor accidentally copies inbound headers wholesale into `headers`.
  for (const h of ["cookie", "authorization", "x-solana-auth", "x-solana-auth-v2"]) {
    headers.delete(h);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstreamRes = await fetch(upstream, init);

  const responseHeaders = new Headers();
  const upstreamContentType = upstreamRes.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("Content-Type", upstreamContentType);
  responseHeaders.set("Cache-Control", "no-store");

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRelayRequest;
export const POST = proxyRelayRequest;
export const HEAD = proxyRelayRequest;
