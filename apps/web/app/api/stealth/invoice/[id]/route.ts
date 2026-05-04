import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * GET /api/stealth/invoice/[id]
 *
 * Public endpoint for claim page — returns only non-sensitive fields.
 * No authentication required; the claim page doesn't have a member wallet.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const invoice = await prisma.stealthInvoice.findUnique({ where: { id } });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: invoice.id,
      cofreAddress: invoice.cofreAddress,
      recipientWallet: invoice.recipientWallet,
      invoiceRef: invoice.invoiceRef,
      memo: invoice.memo,
      stealthPubkey: invoice.stealthPubkey,
      amountHint: invoice.amountHint
        ? Buffer.from(invoice.amountHint).toString("utf-8")
        : null,
      status: invoice.status,
      expiresAt: invoice.expiresAt.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      claimedAt: invoice.claimedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[api/stealth/invoice] get failed:", error);
    return NextResponse.json({ error: "Could not load invoice." }, { status: 500 });
  }
}
