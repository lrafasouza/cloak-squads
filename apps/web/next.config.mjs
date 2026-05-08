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
 *
 * Deliberately NOT set yet:
 * - Content-Security-Policy. Wallet adapters inject scripts and snarkjs uses
 *   wasm-eval; a strict CSP needs a measured rollout in Report-Only first.
 *   Tracked as an open finding in the review.
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
