import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: "standalone",
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
