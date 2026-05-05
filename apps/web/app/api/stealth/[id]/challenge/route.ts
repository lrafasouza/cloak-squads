import { prisma } from "@/lib/prisma";
import { createChallenge } from "@/lib/claim-challenge";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * POST /api/stealth/[id]/challenge
 *
 * Request a challenge for proving ownership of a stealth invoice.
 * No wallet authentication required — the challenge is bound to the invoice ID
 * and must be signed with the stealth keypair within 60 seconds.
 *
 * Rate-limited per invoiceId (not IP) to avoid penalizing users behind NAT.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Rate-limit by invoiceId to prevent challenge flooding on a single invoice
  if (!(await checkRateLimitAsync(`chal:${id}`, "challenge"))) {
    return NextResponse.json({ error: "Too many challenge requests for this invoice." }, { status: 429 });
  }

  try {
    const invoice = await prisma.stealthInvoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (invoice.status === "claimed") {
      return NextResponse.json({ error: "This invoice has already been claimed." }, { status: 409 });
    }

    if (invoice.status === "voided") {
      return NextResponse.json({ error: "This invoice has been voided." }, { status: 409 });
    }

    if (invoice.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invoice has expired." }, { status: 409 });
    }

    const { challengeId, challenge } = createChallenge(id);

    return NextResponse.json({ challengeId, challenge });
  } catch (error) {
    console.error("[api/stealth/challenge] failed:", error);
    return NextResponse.json({ error: "Could not create challenge." }, { status: 500 });
  }
}
