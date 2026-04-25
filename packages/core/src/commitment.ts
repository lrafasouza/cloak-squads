import type { NoteData } from "@cloak.dev/sdk";

export type CommitmentClaim = {
  amount: number;
  r: string;
  sk_spend: string;
  commitment: string;
  recipient_vk: string;
  token_mint: string;
};

function getCloakSDK(): {
  computeCommitment: (note: NoteData) => Promise<{ hex: () => Promise<ArrayLike<number>> }>;
} {
  if (typeof window === "undefined") {
    throw new Error("Cloak SDK only available in the browser runtime");
  }
  const sdk = (window as unknown as { CloakSDK?: unknown }).CloakSDK;
  if (!sdk || typeof (sdk as { computeCommitment?: unknown }).computeCommitment !== "function") {
    throw new Error("Cloak SDK not available on window");
  }
  return sdk as {
    computeCommitment: (note: NoteData) => Promise<{ hex: () => Promise<ArrayLike<number>> }>;
  };
}

export async function recomputeCommitment(claim: CommitmentClaim): Promise<Uint8Array> {
  const note: NoteData = {
    amount: claim.amount,
    r: claim.r,
    sk_spend: claim.sk_spend,
    commitment: "",
  };
  const sdk = getCloakSDK();
  const result = await sdk.computeCommitment(note);
  return new Uint8Array(await result.hex());
}

export function commitmentsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
