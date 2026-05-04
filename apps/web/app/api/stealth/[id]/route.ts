import { prisma } from "@/lib/prisma";
import { decryptField, isEncrypted } from "@/lib/field-crypto";
import { requireVaultMember } from "@/lib/vault-membership";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    // Validate as a valid Solana address (multisig/vault address)
    new PublicKey(id);
  } catch {
    return NextResponse.json({ error: "Invalid cofre address." }, { status: 400 });
  }

  // Membership required to list all invoices of a vault
  const auth = await requireVaultMember(id);
  if (auth instanceof NextResponse) return auth;

  try {
    const invoices = await prisma.stealthInvoice.findMany({
      where: { cofreAddress: id },
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
        amountHint: invoice.amountHint
          ? Buffer.from(invoice.amountHint).toString("utf-8")
          : null,
        status: invoice.status,
        expiresAt: invoice.expiresAt.toISOString(),
        createdAt: invoice.createdAt.toISOString(),
        claimedAt: invoice.claimedAt?.toISOString() ?? null,
        // UTXO data for vault management — decrypt blinding, never expose private key
        utxoAmount: invoice.utxoAmount,
        utxoPublicKey: invoice.utxoPublicKey,
        utxoBlinding: invoice.utxoBlinding
          ? (isEncrypted(invoice.utxoBlinding) ? decryptField(invoice.utxoBlinding) : invoice.utxoBlinding)
          : null,
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
