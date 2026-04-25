import type { CloakKeyPair, type NoteData } from "@cloak.dev/sdk";

declare const CloakSDK = (window as any).CloakSDK;

export type CommitmentClaim = {
  amount: number;
  r: string;
  sk_spend: string;
  commitment: string;
  recipient_vk: string;
  token_mint: string;
};

export async function recomputeCommitment(claim: CommitmentClaim): Promise<Uint8Array> {
  const note: NoteData = {
    amount: claim.amount,
    r: claim.r,
    sk_spend: claim.sk_spend,
    commitment: "",
  };

  const result = await CloakSDK.computeCommitment(note);
  return new Uint8Array(await (result as any).hex());
}

export function commitmentsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
