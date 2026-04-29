import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: "standalone",
  transpilePackages: ["@cloak-squads/core"],
  experimental: {
    // Reduz workers baseado em memória disponível
    memoryBasedWorkersCount: true,
  },
  // Limita workers do webpack
  webpack: (config, { isServer }) => {
    // Explicit @/ alias for environments where tsconfig paths aren't picked up
    config.resolve.alias["@"] = path.resolve(__dirname);
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
