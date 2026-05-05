import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { requireVaultMember, requireVaultOperator } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const SENSITIVE_CLAIM_FIELDS = ["keypairPrivateKey", "blinding", "r", "sk_spend"];

function publicClaim(raw: string): unknown {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (SENSITIVE_CLAIM_FIELDS.includes(key)) continue;
    safe[key] = value;
  }
  return safe;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ multisig: string; index: string }> },
) {
  const { multisig, index } = await params;

  try {
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
  //   - default               → vault member (public claim invariants for verification)
  if (includeSensitive) {
    const auth = await requireVaultOperator(multisig);
    if (auth instanceof NextResponse) return auth;
  } else {
    const auth = await requireVaultMember(multisig);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const draft = await prisma.payrollDraft.findUnique({
      where: {
        cofreAddress_transactionIndex: {
          cofreAddress: multisig,
          transactionIndex: index,
        },
      },
      include: { recipients: true },
    });

    if (!draft) {
      return NextResponse.json({ error: "Payroll draft not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: draft.id,
      cofreAddress: draft.cofreAddress,
      transactionIndex: draft.transactionIndex,
      memo: draft.memo ?? undefined,
      totalAmount: draft.totalAmount,
      recipientCount: draft.recipientCount,
      mode: draft.mode,
      recipients: draft.recipients.map((r) => {
        let invariants: unknown;
        let commitmentClaim: unknown;

        try {
          invariants = JSON.parse(r.invariants);
        } catch {
          invariants = null;
        }

        try {
          if (r.commitmentClaim !== null) {
            commitmentClaim = includeSensitive
              ? JSON.parse(r.commitmentClaim)
              : publicClaim(r.commitmentClaim);
          }
        } catch {
          commitmentClaim = undefined;
        }

        return {
          id: r.id,
          name: r.name,
          wallet: r.wallet,
          amount: r.amount,
          memo: r.memo ?? undefined,
          payloadHash: Array.from(Buffer.from(r.payloadHash)),
          invariants,
          commitmentClaim,
          invoiceId: r.invoiceId ?? undefined,
          signature: r.signature ?? undefined,
        };
      }),
      createdAt: new Date(draft.createdAt).toISOString(),
    });
  } catch (error) {
    console.error("[api/payrolls] get failed:", error);
    return NextResponse.json({ error: "Could not load payroll draft." }, { status: 500 });
  }
}
