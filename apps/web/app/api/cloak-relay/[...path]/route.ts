import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_CLOAK_RELAY_URL = "https://api.devnet.cloak.ag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function relayBaseUrl() {
  return (process.env.NEXT_PUBLIC_CLOAK_RELAY_URL ?? DEFAULT_CLOAK_RELAY_URL).replace(/\/$/, "");
}

async function proxyRelayRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const upstream = new URL(`${relayBaseUrl()}/${path.join("/")}`);
  upstream.search = req.nextUrl.search;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("Accept", accept);

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
