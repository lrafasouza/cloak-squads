import { isPrismaAvailable, prisma } from "@/lib/prisma";
import { checkRateLimitAsync, rateLimitBucket } from "@/lib/rate-limit";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(64).optional(),
  notes: z.string().trim().max(280).nullable().optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "addr-write", auth.publicKey), "write"))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Ensure the entry belongs to the authenticated user
    const existing = await prisma.addressBookEntry.findUnique({ where: { id } });
    if (!existing || existing.ownerPubkey !== auth.publicKey) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const entry = await prisma.addressBookEntry.update({
      where: { id },
      data: {
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
    });
    return NextResponse.json({ entry });
  } catch (error) {
    console.error("[api/address-book] update failed:", error);
    return NextResponse.json({ error: "Could not update entry." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!(await checkRateLimitAsync(rateLimitBucket(ip, "addr-write", auth.publicKey), "write"))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isPrismaAvailable()) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  try {
    const existing = await prisma.addressBookEntry.findUnique({ where: { id } });
    if (!existing || existing.ownerPubkey !== auth.publicKey) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    await prisma.addressBookEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/address-book] delete failed:", error);
    return NextResponse.json({ error: "Could not delete entry." }, { status: 500 });
  }
}
