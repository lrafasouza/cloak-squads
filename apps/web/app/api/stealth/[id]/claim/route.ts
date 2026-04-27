import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { claimedBy } = body;

    if (!claimedBy || typeof claimedBy !== "string") {
      return NextResponse.json({ error: "claimedBy is required" }, { status: 400 });
    }

    const invoice = await prisma.stealthInvoice.update({
      where: { id },
      data: {
        status: "claimed",
        claimedAt: new Date(),
        claimedBy,
      },
    });

    return NextResponse.json(invoice);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not claim invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
