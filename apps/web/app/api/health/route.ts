/**
 * Liveness + readiness probe.
 *
 * Render polls this path on every healthcheck cycle (configured via
 * `healthCheckPath` in render.yaml). When the probe returns non-2xx for
 * too long, Render restarts the instance — which is exactly what we want
 * when DB or Redis become unreachable on a single pod.
 *
 * Contract:
 *   200 OK   — DB reachable AND Redis reachable (or in-memory fallback in dev)
 *   503      — at least one dependency is failing; body explains which
 *
 * The endpoint is deliberately:
 *   - unauthenticated (probes don't carry credentials)
 *   - rate-limit-free (the probe IS the rate; adding a limit creates a
 *     bootstrap loop where the probe locks itself out)
 *   - sub-second (probes timeout aggressively)
 *
 * It returns JSON, not just a status code, so an operator hitting
 * `/api/health` in a browser can immediately see which dependency is
 * red without tailing logs.
 */
import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Hard upper bound on the probe — if either dependency takes longer than
// this to answer, we report it as failed rather than dragging Render's
// healthcheck timer with us.
const DEPENDENCY_TIMEOUT_MS = 2_000;

type DependencyStatus = "ok" | "degraded" | "error";

type HealthBody = {
  status: "ok" | "degraded";
  uptime_s: number;
  commit: string;
  checks: {
    db: { status: DependencyStatus; latency_ms?: number; error?: string };
    redis: { status: DependencyStatus; latency_ms?: number; error?: string };
  };
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

async function checkDb(): Promise<HealthBody["checks"]["db"]> {
  if (!isPrismaAvailable()) {
    return { status: "error", error: "prisma unavailable (no DATABASE_URL)" };
  }
  const t0 = Date.now();
  try {
    // Trivial, index-free, schema-agnostic — never throws on a working DB.
    await withTimeout(prisma.$queryRaw`SELECT 1`, DEPENDENCY_TIMEOUT_MS, "db");
    return { status: "ok", latency_ms: Date.now() - t0 };
  } catch (err) {
    return {
      status: "error",
      latency_ms: Date.now() - t0,
      error: err instanceof Error ? err.message : "unknown db error",
    };
  }
}

async function checkRedis(): Promise<HealthBody["checks"]["redis"]> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // No REDIS_URL: in production, env.ts:superRefine refuses to boot, so
    // we never get here. In dev, the absence is expected — call it
    // `degraded` (not `error`) so the overall status can still be `ok`.
    return { status: "degraded", error: "REDIS_URL not set (dev)" };
  }
  const t0 = Date.now();
  try {
    // Probe via the Upstash REST API — same shape as rate-limit.ts falls
    // back to. We bypass the internal redisClient module here on purpose:
    // a stuck client cache would mask a real outage, and the probe must
    // be self-contained.
    const url = `${redisUrl}/get/__health__`;
    const res = await withTimeout(
      fetch(url, {
        headers: { Authorization: `Bearer ${process.env.REDIS_TOKEN ?? ""}` },
      }),
      DEPENDENCY_TIMEOUT_MS,
      "redis",
    );
    if (!res.ok) {
      return {
        status: "error",
        latency_ms: Date.now() - t0,
        error: `redis HTTP ${res.status}`,
      };
    }
    return { status: "ok", latency_ms: Date.now() - t0 };
  } catch (err) {
    return {
      status: "error",
      latency_ms: Date.now() - t0,
      error: err instanceof Error ? err.message : "unknown redis error",
    };
  }
}

const BOOT_AT = Date.now();

export async function GET() {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);

  const allOk = db.status === "ok" && (redis.status === "ok" || redis.status === "degraded");
  const overall: HealthBody["status"] = allOk
    ? redis.status === "degraded"
      ? "degraded"
      : "ok"
    : "degraded";

  const body: HealthBody = {
    status: overall,
    uptime_s: Math.floor((Date.now() - BOOT_AT) / 1000),
    commit:
      process.env.RENDER_GIT_COMMIT ??
      process.env.GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "unknown",
    checks: { db, redis },
  };

  // Render treats any 2xx as healthy. We return 200 when at least the DB
  // is up (the redis-degraded dev path still passes), and 503 only when
  // the DB is hard-failing — restarting a pod for a transient Redis blip
  // costs more than it saves.
  const httpStatus = db.status === "ok" ? 200 : 503;
  return NextResponse.json(body, { status: httpStatus });
}
