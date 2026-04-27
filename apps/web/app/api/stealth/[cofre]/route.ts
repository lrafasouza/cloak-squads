import { prisma } from "@/lib/prisma";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ cofre: string }> }) {
  const { cofre } = await context.params;

  try {
    new PublicKey(cofre);
  } catch {
    return NextResponse.json({ error: "Invalid cofre address." }, { status: 400 });
  }

  try {
    const invoices = await prisma.stealthInvoice.findMany({
      where: { cofreAddress: cofre },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      invoices.map((invoice) => ({
        id: invoice.id,
        cofreAddress: invoice.cofreAddress,
        recipientWallet: invoice.recipientWallet,
        invoiceRef: invoice.invoiceRef,
        memo: invoice.memo,
        stealthPubkey: invoice.stealthPubkey,
        amountHint: invoice.amountHintEncrypted
          ? Buffer.from(invoice.amountHintEncrypted).toString("utf-8")
          : null,
        status: invoice.status,
        expiresAt: invoice.expiresAt.toISOString(),
        createdAt: invoice.createdAt.toISOString(),
        // UTXO data for claim
        utxoAmount: invoice.utxoAmount,
        utxoPrivateKey: invoice.utxoPrivateKey,
        utxoPublicKey: invoice.utxoPublicKey,
        utxoBlinding: invoice.utxoBlinding,
        utxoMint: invoice.utxoMint,
        utxoLeafIndex: invoice.utxoLeafIndex,
        utxoCommitment: invoice.utxoCommitment,
      })),
    );
  } catch (error) {
    console.error("[api/stealth] list failed:", error);
    return NextResponse.json({ error: "Could not list stealth invoices." }, { status: 500 });
  }
}
