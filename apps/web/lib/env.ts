import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "testnet", "localnet"]),
  NEXT_PUBLIC_RPC_URL: z.string().url(),
  NEXT_PUBLIC_CLOAK_PROGRAM_ID: z.string().min(32),
  NEXT_PUBLIC_CLOAK_RELAY_URL: z.string().url(),
  NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID: z.string().min(32),
  NEXT_PUBLIC_SQUADS_PROGRAM_ID: z.string().min(32),
  NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID: z.string(),
});

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SIGNING_SECRET: z.string().min(16),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_CLOAK_PROGRAM_ID: process.env.NEXT_PUBLIC_CLOAK_PROGRAM_ID,
  NEXT_PUBLIC_CLOAK_RELAY_URL: process.env.NEXT_PUBLIC_CLOAK_RELAY_URL,
  NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID: process.env.NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID,
  NEXT_PUBLIC_SQUADS_PROGRAM_ID: process.env.NEXT_PUBLIC_SQUADS_PROGRAM_ID,
  NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID: process.env.NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID ?? "",
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SIGNING_SECRET: process.env.JWT_SIGNING_SECRET,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });
}

export type PublicEnv = typeof publicEnv;
export type ServerEnv = ReturnType<typeof getServerEnv>;
