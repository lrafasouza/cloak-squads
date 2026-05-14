/**
 * Sole durable store for the operator's per-proposal Cloak deposit cache.
 *
 * Holds `{ leafIndex, spendKey, blinding, withdrawn, … }` so that a retry
 * after a tab close or a different session skips the on-chain deposit
 * (re-depositing would drain operator funds).
 *
 * Audit history:
 *   - Originally a sessionStorage fast-path with this endpoint as the
 *     backup. Pass 4 F-402 (commit e30f55f, 2026-05-13) removed the
 *     sessionStorage path entirely — UTXO secrets (`keypairPrivateKey`,
 *     `blinding`) in browser storage were XSS-exfiltratable. The
 *     `readCloakDepositCacheLocal` / `writeCloakDepositCacheLocal`
 *     helpers in `operator/page.tsx` are now intentionally no-ops; every
 *     read/write hits this endpoint.
 *
 * Auth: requireVaultOperator — only the registered operator for the
 * multisig can read or write. The plaintext payload contains the one-time
 * Cloak spend key, so the row is encrypted at rest with field-crypto.
 */
import { getCurrentCluster } from "@/lib/cluster";
import { decryptField, encryptField } from "@/lib/field-crypto";
import { prisma } from "@/lib/prisma";
import { enforceIpAndWalletLimits } from "@/lib/rate-limit";
import { requireVaultOperator } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const TX_INDEX_RE = /^\d{1,20}$/;

function clientIp(hdrs: Headers): string {
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  return (raw.split(",")[0] ?? raw).trim();
}

function isValidMultisig(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const multisig = url.searchParams.get("multisig");
  const transactionIndex = url.searchParams.get("transactionIndex");

  if (!multisig || !isValidMultisig(multisig)) {
    return NextResponse.json({ error: "Invalid multisig." }, { status: 400 });
  }
  if (!transactionIndex || !TX_INDEX_RE.test(transactionIndex)) {
    return NextResponse.json({ error: "Invalid transactionIndex." }, { status: 400 });
  }

  const auth = await requireVaultOperator(multisig);
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  if (
    !(await enforceIpAndWalletLimits({
      ip: clientIp(hdrs),
      pubkey: auth.publicKey,
      scope: "operator-cache-read",
      ipLimit: 60,
      walletLimit: 120,
    }))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const row = await prisma.operatorDepositCache.findUnique({
    where: {
      cofreAddress_transactionIndex: { cofreAddress: multisig, transactionIndex },
    },
    select: { encryptedPayload: true, updatedAt: true },
  });

  if (!row) return NextResponse.json({ payload: null });

  let payload: unknown;
  try {
    payload = JSON.parse(decryptField(row.encryptedPayload));
  } catch (err) {
    console.error("[operator-deposit-cache] decrypt failed:", err);
    // The row exists but cannot be decrypted (key rotation or tamper).
    // Surface "not found" rather than a hard error so the operator can
    // fall through to a fresh deposit if they choose.
    return NextResponse.json({ payload: null });
  }

  return NextResponse.json({ payload, updatedAt: row.updatedAt });
}

const writeSchema = z.object({
  multisig: z.string(),
  transactionIndex: z.string().regex(TX_INDEX_RE),
  // The payload shape is owned by the client (SerializedCloakDepositCache).
  // We don't validate the inner structure here — we just round-trip it
  // through field-crypto.
  payload: z.unknown(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { multisig, transactionIndex, payload } = parsed.data;
  if (!isValidMultisig(multisig)) {
    return NextResponse.json({ error: "Invalid multisig." }, { status: 400 });
  }

  const auth = await requireVaultOperator(multisig);
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  if (
    !(await enforceIpAndWalletLimits({
      ip: clientIp(hdrs),
      pubkey: auth.publicKey,
      scope: "operator-cache-write",
      ipLimit: 30,
      walletLimit: 60,
    }))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const encryptedPayload = encryptField(JSON.stringify(payload));
  const cluster = getCurrentCluster();

  await prisma.operatorDepositCache.upsert({
    where: {
      cofreAddress_transactionIndex: { cofreAddress: multisig, transactionIndex },
    },
    create: {
      cofreAddress: multisig,
      transactionIndex,
      cluster,
      encryptedPayload,
    },
    update: {
      encryptedPayload,
      cluster,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const multisig = url.searchParams.get("multisig");
  const transactionIndex = url.searchParams.get("transactionIndex");

  if (!multisig || !isValidMultisig(multisig)) {
    return NextResponse.json({ error: "Invalid multisig." }, { status: 400 });
  }
  if (!transactionIndex || !TX_INDEX_RE.test(transactionIndex)) {
    return NextResponse.json({ error: "Invalid transactionIndex." }, { status: 400 });
  }

  const auth = await requireVaultOperator(multisig);
  if (auth instanceof NextResponse) return auth;

  await prisma.operatorDepositCache.deleteMany({
    where: { cofreAddress: multisig, transactionIndex },
  });

  return NextResponse.json({ ok: true });
}
