import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    // Mirror the `@/*` path alias from apps/web/tsconfig.json so unit tests
    // can import server-only modules (lib/audit-data, lib/cluster, …) the
    // same way the Next.js app does. Without this, any `@/lib/*` import
    // throws ERR_MODULE_NOT_FOUND before vi.mock can intercept it.
    alias: {
      "@": path.resolve(__dirname, "../../apps/web"),
    },
  },
});
