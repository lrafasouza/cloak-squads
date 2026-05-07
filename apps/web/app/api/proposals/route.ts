import { getCurrentCluster } from "@/lib/cluster";
import { prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { requireVaultMember } from "@/lib/vault-membership";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const byteArraySchema = z.array(z.number().int().min(0).max(255));

const commitmentClaimSchema = z.object({
  amount: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  invoiceId: z.string().uuid().optional(),
  // Legacy fields (backward compat)
  r: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  sk_spend: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  // UTXO fields (new Cloak scheme)
  keypairPrivateKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  keypairPublicKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  blinding: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  tokenMint: z.string().min(32).max(44).optional(),
  commitment: z.string().regex(/^[0-9a-fA-F]{64}$/),
  recipient_vk: z.string().min(32).max(44),
  token_mint: z.string().min(32).max(44),
  // Encrypted memo decryption key (sensitive — operator only)
  memoBoxSk: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
});

const proposalDraftSchema = z
  .object({
    cofreAddress: z.string().refine(
      (val) => {
        try {
          new PublicKey(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid cofre address" },
    ),
    transactionIndex: z.string().regex(/^\d+$/),
    // "private" → Cloak shielded send (default for back-compat); requires payloadHash + invariants.
    // "public"  → plain Squads transfer; payloadHash + invariants must be omitted.
    kind: z.enum(["private", "public"]).default("private"),
    amount: z
      .string()
      .regex(/^\d+$/)
      .refine(
        (val) => {
          try {
            const n = BigInt(val);
            return n > 0n && n <= BigInt("18446744073709551615");
          } catch {
            return false;
          }
        },
        { message: "Amount out of valid range" },
      ),
    recipient: z.string().refine(
      (val) => {
        try {
          new PublicKey(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid recipient address" },
    ),
    memo: z.string().max(200).optional(),
    payloadHash: byteArraySchema.length(32).optional(),
    invariants: z
      .object({
        nullifier: byteArraySchema.length(32),
        commitment: byteArraySchema.length(32),
        amount: z.string().regex(/^\d+$/),
        tokenMint: z.string().refine(
          (val) => {
            try {
              new PublicKey(val);
              return true;
            } catch {
              return false;
            }
          },
          { message: "Invalid token mint" },
        ),
        recipientVkPub: byteArraySchema.length(32),
        nonce: byteArraySchema.length(16),
      })
      .optional(),
    commitmentClaim: commitmentClaimSchema.optional(),
    signature: z.string().min(32).max(128).optional(),
    // Encrypted memo fields (optional — present only for private sends with a memo)
    memoCiphertext: byteArraySchema.optional(),
    memoNonce: byteArraySchema.length(24).optional(),
    memoEphemeralPk: byteArraySchema.length(32).optional(),
    // Source vault index — 0 = primary, > 0 = sub-vault. Defaults to 0 for back-compat.
    vaultIndex: z.number().int().min(0).max(255).optional(),
    // Token mint for public sends (private sends already carry it inside `invariants`).
    tokenMint: z
      .string()
      .refine(
        (val) => {
          try {
            new PublicKey(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Invalid token mint" },
      )
      .optional(),
  })
  .refine(
    (data) =>
      data.kind === "public"
        ? data.payloadHash === undefined && data.invariants === undefined
        : data.payloadHash !== undefined && data.invariants !== undefined,
    {
      message: "Private kind requires payloadHash + invariants; public kind must omit them.",
      path: ["kind"],
    },
  );

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = proposalDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid proposal draft.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Membership check requires the cofreAddress from the validated body
  const auth = await requireVaultMember(parsed.data.cofreAddress);
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (
    !(await checkRateLimitAsync(rateLimitBucket(ip, "proposals-write", auth.publicKey), "write"))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    // Public sends carry the token mint at the top level (private sends embed it
    // inside `invariants`). Synthesize a thin invariants record for public drafts
    // so the proposal page can render the correct token symbol without branching.
    const invariantsForStorage =
      parsed.data.kind === "public"
        ? parsed.data.tokenMint
          ? { tokenMint: parsed.data.tokenMint }
          : null
        : parsed.data.invariants;

    const draft = await prisma.proposalDraft.create({
      data: {
        cofreAddress: parsed.data.cofreAddress,
        cluster: getCurrentCluster(),
        transactionIndex: parsed.data.transactionIndex,
        kind: parsed.data.kind,
        amount: parsed.data.amount,
        recipient: parsed.data.recipient,
        memo: parsed.data.memo ?? null,
        payloadHash: parsed.data.payloadHash ? Buffer.from(parsed.data.payloadHash) : null,
        invariants: invariantsForStorage ? JSON.stringify(invariantsForStorage) : null,
        commitmentClaim:
          parsed.data.commitmentClaim === undefined
            ? null
            : JSON.stringify(parsed.data.commitmentClaim),
        signature: parsed.data.signature ?? null,
        memoCiphertext: parsed.data.memoCiphertext ? Buffer.from(parsed.data.memoCiphertext) : null,
        memoNonce: parsed.data.memoNonce ? Buffer.from(parsed.data.memoNonce) : null,
        memoEphemeralPk: parsed.data.memoEphemeralPk
          ? Buffer.from(parsed.data.memoEphemeralPk)
          : null,
        vaultIndex: parsed.data.vaultIndex ?? 0,
      },
    });

    return NextResponse.json(serializeDraft(draft, { includeSensitive: true }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Proposal draft already exists." }, { status: 409 });
    }
    console.error("[api/proposals] create failed:", error);
    return NextResponse.json({ error: "Could not create proposal draft." }, { status: 500 });
  }
}
