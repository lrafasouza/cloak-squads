import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { requireVaultMember } from "@/lib/vault-membership";
import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const swapDraftSchema = z.object({
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
  inputMint: z.string().min(32).max(44),
  outputMint: z.string().min(32).max(44),
  inputAmount: z.string().regex(/^\d+$/),
  outputAmount: z.string().regex(/^\d+$/),
  inputSymbol: z.string().max(20),
  outputSymbol: z.string().max(20),
  memo: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = swapDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid swap draft.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const auth = await requireVaultMember(parsed.data.cofreAddress);
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "swaps-write", auth.publicKey), "write"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const draft = await prisma.swapDraft.create({
      data: {
        cofreAddress: parsed.data.cofreAddress,
        transactionIndex: parsed.data.transactionIndex,
        inputMint: parsed.data.inputMint,
        outputMint: parsed.data.outputMint,
        inputAmount: parsed.data.inputAmount,
        outputAmount: parsed.data.outputAmount,
        inputSymbol: parsed.data.inputSymbol,
        outputSymbol: parsed.data.outputSymbol,
        memo: parsed.data.memo ?? null,
      },
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Swap draft already exists." }, { status: 409 });
    }
    console.error("[api/swaps] create failed:", error);
    return NextResponse.json({ error: "Could not create swap draft." }, { status: 500 });
  }
}
