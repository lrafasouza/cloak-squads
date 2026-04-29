import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import { z } from "zod";

const auditLinkCreateSchema = z.object({
  cofreAddress: z.string().refine(
    (val) => {
      try {
        // PDAs (multisig addresses) are valid but off-curve
        new PublicKey(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid cofre address" },
  ),
  scope: z.enum(["full", "amounts_only", "time_ranged"]),
  scopeParams: z
    .object({
      startDate: z.number().int().positive().optional(),
      endDate: z.number().int().positive().optional(),
    })
    .optional(),
  expiresAt: z.number().int().positive(),
  issuedBy: z.string().refine(
    (val) => {
      try {
        // Wallet addresses may be PDAs (off-curve but valid)
        new PublicKey(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid issuer address" },
  ),
  signature: z.string().min(64).max(256),
});

export async function POST(request: Request) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = auditLinkCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid audit link request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { cofreAddress, scope, scopeParams, expiresAt, issuedBy, signature } = parsed.data;

    // Verify signature against message
    // Message: "create-audit-link:${cofreAddress}:${scope}:${expiresAt}:${issuedBy}"
    const message = `create-audit-link:${cofreAddress}:${scope}:${expiresAt}:${issuedBy}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, "base64");
    const issuerPubkey = new PublicKey(issuedBy).toBytes();

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, issuerPubkey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Compute diversifier using the same logic as core/hashing.ts
    const linkId = crypto.randomUUID();
    const startDate = scopeParams?.startDate ?? 0n;
    const endDate = scopeParams?.endDate ?? BigInt(Date.now());

    const encoder = new TextEncoder();
    const separator = new Uint8Array([
      0x63, 0x6c, 0x6f, 0x61, 0x6b, 0x2d, 0x61, 0x75, 0x64, 0x69, 0x74, 0x2d, 0x76, 0x31,
    ]); // "cloak-audit-v1"

    const linkIdBytes = encoder.encode(linkId);
    const scopeBytes = encoder.encode(scope);

    const startBytes = new Uint8Array(8);
    const startView = new DataView(startBytes.buffer);
    startView.setBigUint64(0, BigInt(startDate), true);

    const endBytes = new Uint8Array(8);
    const endView = new DataView(endBytes.buffer);
    endView.setBigUint64(0, BigInt(endDate), true);

    const input = new Uint8Array(separator.length + linkIdBytes.length + scopeBytes.length + 8 + 8);
    let offset = 0;
    input.set(separator, offset);
    offset += separator.length;
    input.set(linkIdBytes, offset);
    offset += linkIdBytes.length;
    input.set(scopeBytes, offset);
    offset += scopeBytes.length;
    input.set(startBytes, offset);
    offset += 8;
    input.set(endBytes, offset);

    // Simple hash using Web Crypto API (BLAKE3 not available in Edge)
    const hashBuffer = await crypto.subtle.digest("SHA-256", input);
    const diversifier = new Uint8Array(hashBuffer).slice(0, 32);

    const auditLink = await prisma.auditLink.create({
      data: {
        id: linkId,
        cofreAddress,
        diversifier: Buffer.from(diversifier),
        scope,
        scopeParams: scopeParams ? JSON.stringify(scopeParams) : null,
        expiresAt: new Date(expiresAt),
        issuedBy,
        signature: Buffer.from(signature, "base64"),
      },
    });

    return NextResponse.json(
      {
        id: auditLink.id,
        cofreAddress: auditLink.cofreAddress,
        scope: auditLink.scope,
        scopeParams: auditLink.scopeParams,
        expiresAt: auditLink.expiresAt.toISOString(),
        issuedBy: auditLink.issuedBy,
        createdAt: auditLink.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Audit link already exists." }, { status: 409 });
    }
    console.error("[api/audit-links] create failed:", error);
    return NextResponse.json({ error: "Could not create audit link." }, { status: 500 });
  }
}
