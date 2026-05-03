import { prisma } from "@/lib/prisma";
import { encryptField } from "@/lib/field-crypto";
import { requireVaultOperator } from "@/lib/vault-membership";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Read the invoice to get cofreAddress for operator check
  const existing = await prisma.stealthInvoice.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const auth = await requireVaultOperator(existing.cofreAddress);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const {
      utxoAmount,
      utxoPrivateKey,
      utxoPublicKey,
      utxoBlinding,
      utxoMint,
      utxoLeafIndex,
      utxoCommitment,
      utxoSiblingCommitment,
      utxoLeftSiblingCommitment,
    } = body;

    // Encrypt sensitive fields at rest
    const invoice = await prisma.stealthInvoice.update({
      where: { id },
      data: {
        utxoAmount,
        utxoPrivateKey: utxoPrivateKey ? encryptField(utxoPrivateKey) : null,
        utxoPublicKey,
        utxoBlinding: utxoBlinding ? encryptField(utxoBlinding) : null,
        utxoMint,
        utxoLeafIndex,
        utxoCommitment,
        utxoSiblingCommitment,
        utxoLeftSiblingCommitment,
      },
    });

    return NextResponse.json(invoice);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not update UTXO data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
