import { prisma } from "@/lib/prisma";
import { advanceCadence, isCadence } from "@/lib/recurring-cadence";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

/**
 * Mark a recurring payment as run.
 *
 * The actual proposal creation happens client-side (the UI calls this AFTER
 * the proposal lands so we don't desync if the wallet bails). This endpoint
 * just bumps `lastRunAt` and rolls `nextDueAt` forward by one cadence.
 *
 * Marking is idempotent within a 60-second window — if the UI retries we
 * don't double-advance the schedule.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ vault: string; id: string }> },
) {
  const { vault, id } = await context.params;
  try {
    new PublicKey(vault);
  } catch {
    return NextResponse.json({ error: "Invalid vault address." }, { status: 400 });
  }
  const auth = await requireVaultMember(vault);
  if (auth instanceof NextResponse) return auth;

  const existing = await prisma.recurringPayment.findUnique({ where: { id } });
  if (!existing || existing.cofreAddress !== vault) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.status !== "active") {
    return NextResponse.json({ error: "Recurring payment is not active." }, { status: 409 });
  }
  if (!isCadence(existing.cadence)) {
    return NextResponse.json({ error: "Stored cadence is invalid." }, { status: 500 });
  }

  // Idempotency window — if we ran this very recently, return the current state
  // without bumping. Avoids double-advance when the user clicks twice.
  if (existing.lastRunAt && Date.now() - existing.lastRunAt.getTime() < 60_000) {
    return NextResponse.json({
      lastRunAt: existing.lastRunAt.toISOString(),
      nextDueAt: existing.nextDueAt.toISOString(),
      idempotent: true,
    });
  }

  const now = new Date();
  // Advance from whichever is later: now, or the previous nextDueAt — keeps the
  // schedule honest if a payment was run early.
  const base = existing.nextDueAt > now ? existing.nextDueAt : now;
  const nextDueAt = advanceCadence(base, existing.cadence);

  const updated = await prisma.recurringPayment.update({
    where: { id },
    data: { lastRunAt: now, nextDueAt },
  });

  return NextResponse.json({
    lastRunAt: updated.lastRunAt?.toISOString() ?? null,
    nextDueAt: updated.nextDueAt.toISOString(),
    idempotent: false,
  });
}
