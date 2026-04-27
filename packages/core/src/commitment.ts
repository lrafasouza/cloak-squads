export type CommitmentClaim = {
  amount: string | number;
  r: string;
  sk_spend: string;
  commitment: string;
  recipient_vk: string;
  token_mint: string;
};

export type CommitmentNote = {
  amount: string | number;
  r: string;
  sk_spend: string;
  commitment: string;
};

export type ComputeCommitmentFn = (note: CommitmentNote) => Promise<bigint>;

let _computeCommitmentFn: ComputeCommitmentFn | null = null;

export function registerComputeCommitmentFn(fn: ComputeCommitmentFn) {
  _computeCommitmentFn = fn;
}

export function commitmentBigintToBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function recomputeCommitment(claim: CommitmentClaim): Promise<Uint8Array> {
  if (!_computeCommitmentFn) {
    throw new Error("computeCommitment not registered — call registerComputeCommitmentFn at app init");
  }
  const note: CommitmentNote = {
    amount: claim.amount,
    r: claim.r,
    sk_spend: claim.sk_spend,
    commitment: "",
  };
  const result = await _computeCommitmentFn(note);
  return commitmentBigintToBytes(result);
}

export function commitmentsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
