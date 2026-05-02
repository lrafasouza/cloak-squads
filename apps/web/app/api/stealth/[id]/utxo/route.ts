import { prisma } from "@/lib/prisma";
import { requireWalletAuth } from "@/lib/wallet-auth";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWalletAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
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

    const invoice = await prisma.stealthInvoice.update({
      where: { id },
      data: {
        utxoAmount,
        utxoPrivateKey,
        utxoPublicKey,
        utxoBlinding,
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
