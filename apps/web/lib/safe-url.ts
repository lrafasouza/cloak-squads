/**
 * Validate a user-submitted outbound URL before storing or fetching it.
 *
 * SSRF defence is layered. This module is the *write-time* defence — it
 * rejects literal IPs in private ranges, the cloud metadata IPs, "localhost",
 * dot-less names (which can resolve to internal services), userinfo, and
 * non-http(s) schemes. It cannot prevent DNS rebinding by itself: a hostname
 * that resolves to a public IP at write-time and a private IP at fetch-time
 * still passes here.
 *
 * The dispatcher that actually fetches these URLs MUST add the runtime
 * defences too:
 *   - Resolve DNS server-side, re-check every resolved address.
 *   - Disable HTTP redirects (or follow only to URLs that pass this same gate).
 *   - Cap response size, set an aggressive timeout.
 *   - Disable Node's `family: 0` so it can't fall back to IPv6 link-local.
 *
 * Until that runtime layer exists, the field can be stored but not
 * dereferenced — see `apps/web/app/api/vaults/[multisig]/route.ts`.
 */

const PRIVATE_IPV4_PREFIXES = [
  "0.", // RFC1122 "this network"
  "127.", // loopback
  "10.", // RFC1918
  "169.254.", // link-local + AWS/GCP metadata (169.254.169.254)
  "192.168.", // RFC1918
  "100.64.", // CGNAT — 100.64.0.0/10. Conservative: block the whole prefix.
];

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIPv4(addr: string): boolean {
  const m = IPV4_LITERAL.exec(addr);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 100.64.0.0/10 — m[2] in 64..127
  if (a === 100 && b >= 64 && b <= 127) return true;
  return PRIVATE_IPV4_PREFIXES.some((p) => addr.startsWith(p));
}

function isPrivateIPv6(addr: string): boolean {
  const lc = addr.toLowerCase();
  // Loopback ::1 and unspecified ::
  if (lc === "::1" || lc === "::") return true;
  // Unique local fc00::/7 — first byte 0xfc or 0xfd
  if (/^f[cd][0-9a-f]{0,2}(?::|$)/.test(lc)) return true;
  // Link-local fe80::/10 (fe80–febf)
  if (/^fe[89ab][0-9a-f]?(?::|$)/.test(lc)) return true;
  // IPv4-mapped ::ffff:a.b.c.d (dotted) or canonical compressed ::ffff:xxxx:xxxx.
  // WHATWG URL parsing canonicalises ::ffff:127.0.0.1 → ::ffff:7f00:1, so we
  // must recognise both forms or an attacker sneaks loopback through.
  if (lc.startsWith("::ffff:")) {
    const tail = lc.slice(7);
    if (IPV4_LITERAL.test(tail)) return isPrivateIPv4(tail);
    const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (m) {
      const g1 = Number.parseInt(m[1] ?? "0", 16);
      const g2 = Number.parseInt(m[2] ?? "0", 16);
      const a = (g1 >> 8) & 0xff;
      const b = g1 & 0xff;
      const c = (g2 >> 8) & 0xff;
      const d = g2 & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }
  return false;
}

function isIpAddress(host: string): "v4" | "v6" | null {
  if (IPV4_LITERAL.test(host)) return "v4";
  // After bracket strip, a colon in a hostname is unique to IPv6.
  if (host.includes(":")) return "v6";
  return null;
}

/**
 * URL.hostname returns IPv6 with brackets (e.g. "[::1]"); strip them so the
 * rest of the gate sees the bare numeric form.
 */
function normaliseHost(rawHost: string): string {
  const lc = rawHost.toLowerCase();
  if (lc.startsWith("[") && lc.endsWith("]")) {
    return lc.slice(1, -1);
  }
  return lc;
}

export class UnsafeOutboundUrlError extends Error {
  constructor(
    public readonly reason: string,
    public readonly hint: string,
  ) {
    super(`Unsafe outbound URL: ${reason}. ${hint}`);
    this.name = "UnsafeOutboundUrlError";
  }
}

export type SafeOutboundUrlOptions = {
  /** Allowed schemes. Defaults to ["https:"] — http: leaks credentials over the wire. */
  allowedSchemes?: string[];
  /** Allowed ports. Defaults to [443] (or [80, 443] when http: is allowed). */
  allowedPorts?: number[];
};

/**
 * Throws UnsafeOutboundUrlError if the URL fails any write-time check.
 * Returns the parsed URL on success so callers can canonicalise.
 */
export function assertSafeOutboundUrl(input: string, opts: SafeOutboundUrlOptions = {}): URL {
  const allowedSchemes = opts.allowedSchemes ?? ["https:"];
  const allowedPorts = opts.allowedPorts ?? (allowedSchemes.includes("http:") ? [80, 443] : [443]);

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeOutboundUrlError("malformed URL", "Provide a full https:// URL.");
  }

  if (!allowedSchemes.includes(url.protocol)) {
    throw new UnsafeOutboundUrlError(
      `scheme "${url.protocol}" not allowed`,
      `Only ${allowedSchemes.join(", ")} accepted.`,
    );
  }

  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError("URL contains credentials", "Strip user:pass@ from the URL.");
  }

  // URL.port is "" when default for the scheme
  if (url.port) {
    const portNum = Number(url.port);
    if (!Number.isInteger(portNum) || !allowedPorts.includes(portNum)) {
      throw new UnsafeOutboundUrlError(
        `port ${url.port} not allowed`,
        "Use the default port for the scheme.",
      );
    }
  }

  const host = normaliseHost(url.hostname);

  if (host.length === 0) {
    throw new UnsafeOutboundUrlError("missing hostname", "URL must include a host.");
  }

  // "localhost" + variants
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new UnsafeOutboundUrlError("loopback hostname", "URL cannot point at localhost.");
  }

  // Dot-less names usually resolve to internal services on a search-domain
  // (e.g. "metadata", "kubernetes"). Refuse them outright.
  const ipKind = isIpAddress(host);
  if (ipKind === null && !host.includes(".")) {
    throw new UnsafeOutboundUrlError("single-label hostname", "Use a fully-qualified domain name.");
  }

  if (ipKind === "v4" && isPrivateIPv4(host)) {
    throw new UnsafeOutboundUrlError(
      `private IPv4 address (${host})`,
      "Reserved or loopback ranges are not reachable.",
    );
  }
  if (ipKind === "v6" && isPrivateIPv6(host)) {
    throw new UnsafeOutboundUrlError(
      `private IPv6 address (${host})`,
      "Reserved or loopback ranges are not reachable.",
    );
  }

  return url;
}
