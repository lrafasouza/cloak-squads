import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

let _prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = globalForPrisma.prisma ?? createPrisma();
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = _prisma;
    }
  }
  return _prisma;
}

/**
 * Lazy PrismaClient proxy — only instantiates on first property access.
 * Prevents crash on module import when DATABASE_URL is missing.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string, unknown>)[String(prop)];
  },
});

/**
 * Returns true if the database is configured and reachable.
 * Used to gracefully degrade read endpoints in local dev when DATABASE_URL is missing.
 */
export function isPrismaAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
