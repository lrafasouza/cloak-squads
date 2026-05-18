/**
 * CSP violation collector (audit Pass 4 F-405).
 *
 * Receives `Content-Security-Policy-Report-Only` violations from the browser
 * via two formats:
 *   - Legacy `report-uri`: POST with `Content-Type: application/csp-report`,
 *     body `{ "csp-report": { ... } }`.
 *   - Modern `report-to`: POST with `Content-Type: application/reports+json`,
 *     body is an array of report objects.
 *
 * We log a redacted summary so the enforce-flip plan has data without
 * filling logs with noise. The endpoint is intentionally unauthenticated —
 * the browser does not send credentials — but it's rate-limited per IP to
 * shield against drive-by spam.
 */

import { checkRateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

// Don't cache or pre-render.
export const dynamic = "force-dynamic";

type LegacyReport = {
  "csp-report"?: {
    "document-uri"?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "blocked-uri"?: string;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
    disposition?: string;
    "status-code"?: number;
  };
};

type ModernReport = {
  type?: string;
  age?: number;
  url?: string;
  body?: {
    documentURL?: string;
    effectiveDirective?: string;
    blockedURL?: string;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    disposition?: string;
  };
};

function truncate(value: unknown, max = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function POST(request: Request) {
  // Rate-limit per IP. 60 reports / minute is generous enough for a
  // refresh-storm and tight enough that a malicious sender can't DoS the
  // logger. Reports beyond the budget are silently dropped.
  const hdrs = await nextHeaders();
  const rawIp = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = rawIp.split(",")[0]?.trim() || "unknown";
  const bucket = rateLimitBucket(ip, "csp-report");
  if (!checkRateLimit(bucket, 60, 60_000)) {
    return new NextResponse(null, { status: 204 });
  }

  let payload: LegacyReport | ModernReport[] | undefined;
  try {
    payload = (await request.json()) as LegacyReport | ModernReport[];
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const reports = Array.isArray(payload)
    ? payload.map((r) => ({
        directive: truncate(r.body?.effectiveDirective),
        blocked: truncate(r.body?.blockedURL),
        source: truncate(r.body?.sourceFile),
        line: r.body?.lineNumber,
        column: r.body?.columnNumber,
        disposition: r.body?.disposition,
        documentUrl: truncate(r.body?.documentURL),
      }))
    : payload?.["csp-report"]
      ? [
          {
            directive: truncate(
              payload["csp-report"]["effective-directive"] ??
                payload["csp-report"]["violated-directive"],
            ),
            blocked: truncate(payload["csp-report"]["blocked-uri"]),
            source: truncate(payload["csp-report"]["source-file"]),
            line: payload["csp-report"]["line-number"],
            column: payload["csp-report"]["column-number"],
            disposition: payload["csp-report"].disposition,
            documentUrl: truncate(payload["csp-report"]["document-uri"]),
          },
        ]
      : [];

  for (const r of reports) {
    if (!r.directive && !r.blocked) continue; // empty payload
    // Render's log drain ingests stdout. JSON keeps the field structure
    // searchable. Keep noisy at info-level for the report-only window;
    // bump to debug once enforce ships.
    console.info(JSON.stringify({ ev: "csp-violation", ip, ...r }));
  }

  return new NextResponse(null, { status: 204 });
}
