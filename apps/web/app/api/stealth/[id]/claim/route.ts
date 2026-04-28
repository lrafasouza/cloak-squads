import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const hdrs = await headers();
  const raw = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  const ip = (raw.split(",")[0] ?? raw).trim();
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { claimedBy } = body as { claimedBy?: unknown };
    if (!claimedBy || typeof claimedBy !== "string") {
      return NextResponse.json({ error: "claimedBy is required" }, { status: 400 });
    }

    try {
      new PublicKey(claimedBy);
    } catch {
      return NextResponse.json({ error: "Invalid claimedBy address." }, { status: 400 });
    }

    const invoice = await prisma.stealthInvoice.update({
      where: { id },
      data: { status: "claimed", claimedAt: new Date(), claimedBy },
      select: { id: true, status: true, claimedAt: true },
    });

    return NextResponse.json(invoice);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not claim invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
