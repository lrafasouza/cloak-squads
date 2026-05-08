import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Security headers applied to every response.
 *
 * What we set here (safe — no functional regressions):
 * - X-Frame-Options: DENY      — blocks clickjacking on the proposal-approve
 *                                flow (no embedding in any iframe).
 * - X-Content-Type-Options     — disables MIME-sniffing.
 * - Strict-Transport-Security  — forces HTTPS once the browser has seen the
 *                                header (HSTS preload eligible after rollout).
 * - Referrer-Policy            — `strict-origin-when-cross-origin` keeps the
 *                                URL fragment (`#sk=` claim secrets) out of
 *                                external referrer logs while still letting
 *                                same-origin analytics see the path.
 * - Permissions-Policy         — denies camera/mic/geolocation/payment APIs.
 * - Cross-Origin-Opener-Policy — `same-origin` isolates the wallet popup.
 * - CSP-Report-Only            — see CSP_REPORT_ONLY below.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * Content-Security-Policy in *Report-Only* mode.
 *
 * Two reasons we ship report-only first instead of an enforcing policy:
 *   1. Wallet adapters (Phantom, Solflare, etc.) and Next.js dev/runtime both
 *      inject inline `<script>` tags. A strict policy without `'unsafe-inline'`
 *      breaks the page silently.
 *   2. snarkjs / circom-runtime evaluate compiled WASM at runtime, which needs
 *      `'wasm-unsafe-eval'` in script-src.
 *
 * Report-Only logs violations to the browser console without blocking, so we
 * see what real users hit before flipping to enforce. After ~1 week of clean
 * production logs, drop the `-Report-Only` suffix.
 *
 * Notes on each directive:
 *   - default-src 'self' is the locked-down baseline; everything else opens
 *     just what we actually need.
 *   - script-src includes 'unsafe-inline' (wallet adapters / Next bootstrap)
 *     and 'wasm-unsafe-eval' (snarkjs). 'unsafe-eval' is intentionally left
 *     OFF — modern Next + React don't need it; if a violation surfaces, we
 *     can add it but should investigate first.
 *   - style-src 'unsafe-inline' is required by Tailwind / shadcn injecting
 *     style tags.
 *   - connect-src is the loudest one — every Solana RPC, the Cloak relay,
 *     CoinGecko, the price feeds, our own API. We allow https:/wss: globally
 *     because RPC URLs are user-configurable (NEXT_PUBLIC_RPC_URL).
 *   - frame-ancestors 'none' duplicates X-Frame-Options for browsers that
 *     respect CSP over the legacy header.
 *   - form-action 'self' prevents form-based exfiltration to attacker hosts.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

SECURITY_HEADERS.push({ key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  transpilePackages: [
    "@cloak-squads/core",
    "@solana/wallet-adapter-wallets",
    "@solana/wallet-adapter-fractal",
    "@fractalwagmi/solana-wallet-adapter",
  ],
  experimental: {
    // Reduz workers baseado em memória disponível
    memoryBasedWorkersCount: true,
  },
  // Mark Orca SDK + @solana/kit as server-side externals so Next.js doesn't bundle
  // their WASM/native deps (whirlpools-core uses WASM, kit packages are ESM).
  serverExternalPackages: [
    "@orca-so/whirlpools",
    "@orca-so/whirlpools-client",
    "@orca-so/whirlpools-core",
    "@orca-so/tx-sender",
    "@solana/kit",
    "@solana/rpc",
    "@solana/addresses",
    "@solana/signers",
    "@solana/instructions",
    "@solana/transactions",
    "@solana/transaction-messages",
    "@solana/sysvars",
    "@solana-program/system",
    "@solana-program/token",
    "@solana-program/token-2022",
    "@solana-program/memo",
  ],
  // Limita workers do webpack
  webpack: (config, { isServer }) => {
    // Explicit @/ alias for environments where tsconfig paths aren't picked up
    config.resolve.alias["@"] = path.resolve(__dirname);
    // pnpm strict hoisting: ensure modules can be resolved from the root node_modules
    config.resolve.modules = [path.resolve(__dirname, "node_modules"), "node_modules"];
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules\/pino\/lib\/tools\.js/ },
      { message: /Can't resolve 'pino-pretty'/ },
    ];
    // Reduz paralelismo
    config.parallelism = 2;
    return config;
  },
};

export default nextConfig;
