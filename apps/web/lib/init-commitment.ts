import { registerComputeCommitmentFn } from "@cloak-squads/core/commitment";
import { computeCommitment } from "@cloak.dev/sdk-devnet";

let _registered = false;

export function ensureCommitmentFn() {
  if (_registered) return;
  registerComputeCommitmentFn(async (note) => {
    return computeCommitment(
      BigInt(note.amount),
      BigInt("0x" + (note.r || "0")),
      BigInt("0x" + (note.sk_spend || "0")),
    );
  });
  _registered = true;
}
