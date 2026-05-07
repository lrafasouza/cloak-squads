import { prisma } from "@/lib/prisma";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  label: z.string().trim().min(1).max(80).optional(),
});

export async function PATCH(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.recurringPayment.findUnique({ where: { id } });
  if (!existing || existing.cofreAddress !== vault) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.recurringPayment.update({
    where: { id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.label ? { label: parsed.data.label } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  // Soft-delete via status flag — keeps history if the auditor asks.
  await prisma.recurringPayment.update({
    where: { id },
    data: { status: "cancelled" },
  });

  return NextResponse.json({ ok: true });
}
