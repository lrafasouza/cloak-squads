import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { serializeDraft } from "@/lib/serialize-proposal-draft";
import { requireVaultMember, requireVaultOperator } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET(
  request: Request,
  context: { params: Promise<{ multisig: string; index: string }> },
) {
  const { multisig, index } = await context.params;

  try {
    // Validate multisig address
    new PublicKey(multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const url = new URL(request.url);
  const includeSensitive = url.searchParams.get("includeSensitive") === "true";

  // Tier the access:
  //   - includeSensitive=true → operator-only (UTXO secrets)
  //   - default               → vault member (public claim invariants for verification before signing)
  if (includeSensitive) {
    const auth = await requireVaultOperator(multisig);
    if (auth instanceof NextResponse) return auth;
  } else {
    const auth = await requireVaultMember(multisig);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const draft = await prisma.proposalDraft.findUnique({
      where: { cofreAddress_transactionIndex: { cofreAddress: multisig, transactionIndex: index } },
    });

    if (!draft) {
      return NextResponse.json({ error: "Proposal draft not found." }, { status: 404 });
    }

    return NextResponse.json(
      serializeDraft(draft, {
        includeSensitive,
        // Members get the public claim (commitment, amount, recipient_vk, token_mint, keypairPublicKey)
        // so they can verify what they're signing without seeing UTXO secrets.
        includePublicClaim: !includeSensitive,
      }),
    );
  } catch (error) {
    console.error("[api/proposals] get failed:", error);
    return NextResponse.json({ error: "Could not load proposal draft." }, { status: 500 });
  }
}

const archiveSchema = z.object({
  action: z.enum(["archive", "unarchive"]),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ multisig: string; index: string }> },
) {
  const params = await context.params;

  const auth = await requireVaultMember(params.multisig);
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "proposals-archive", auth.publicKey), "write"))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    new PublicKey(params.multisig);
  } catch {
    return NextResponse.json({ error: "Invalid multisig address." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const draft = await prisma.proposalDraft.update({
      where: {
        cofreAddress_transactionIndex: {
          cofreAddress: params.multisig,
          transactionIndex: params.index,
        },
      },
      data: { archivedAt: parsed.data.action === "archive" ? new Date() : null },
    });

    return NextResponse.json({
      ok: true,
      draft: serializeDraft(draft, { includeSensitive: true }),
    });
  } catch (error) {
    console.error("[api/proposals] archive failed:", error);
    return NextResponse.json({ error: "Could not update proposal draft." }, { status: 500 });
  }
}
