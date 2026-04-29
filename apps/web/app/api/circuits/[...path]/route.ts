import { type NextRequest, NextResponse } from "next/server";

/**
 * Proxy for ZK circuit artifacts hosted at https://cloak-circuits.s3.us-east-1.amazonaws.com.
 *
 * The S3 bucket does not expose CORS headers, so the browser blocks direct fetches
 * from our origin. This route fetches the artifact server-side and re-emits it with
 * the same Content-Type, eliminating the cross-origin issue.
 *
 * See: docs/CORS_S3_CIRCUITS_ERROR.md
 */

const S3_BASE = "https://cloak-circuits.s3.us-east-1.amazonaws.com";

// Circuit artifacts are immutable per version (0.1.0), safe to cache aggressively.
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";

export const runtime = "nodejs";
// Stream the response without buffering whole .zkey (~tens of MB) into RAM twice.
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const subPath = path.join("/");
  const upstream = `${S3_BASE}/${subPath}`;

  const upstreamRes = await fetch(upstream, { cache: "no-store" });

  if (!upstreamRes.ok || !upstreamRes.body) {
    return new NextResponse(`Upstream fetch failed: ${upstreamRes.status}`, {
      status: upstreamRes.status,
    });
  }

  const headers = new Headers();
  const contentType =
    upstreamRes.headers.get("content-type") ??
    (subPath.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
  headers.set("Content-Type", contentType);
  const len = upstreamRes.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", CACHE_CONTROL);

  return new NextResponse(upstreamRes.body, { status: 200, headers });
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const subPath = path.join("/");
  const upstream = `${S3_BASE}/${subPath}`;

  const upstreamRes = await fetch(upstream, { method: "HEAD" });

  const headers = new Headers();
  const contentType =
    upstreamRes.headers.get("content-type") ??
    (subPath.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
  headers.set("Content-Type", contentType);
  const len = upstreamRes.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", CACHE_CONTROL);

  return new NextResponse(null, { status: upstreamRes.status, headers });
}
