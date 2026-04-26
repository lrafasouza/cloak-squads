import { registerComputeCommitmentFn } from "@cloak-squads/core/commitment";
import { computeCommitment } from "@cloak.dev/sdk-devnet";
import type { NoteData } from "@cloak.dev/sdk-devnet";

let _registered = false;

export function ensureCommitmentFn() {
  if (_registered) return;
  registerComputeCommitmentFn(async (note: NoteData) => {
    return computeCommitment(
      BigInt(note.amount),
      BigInt("0x" + (note.r || "0")),
      BigInt("0x" + (note.sk_spend || "0")),
    );
  });
  _registered = true;
}
