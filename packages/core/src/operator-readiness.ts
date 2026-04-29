export type OperatorProposalStatus = "approved" | "executed" | "other" | "loading" | "error";

export function canRunOperatorExecution(status: OperatorProposalStatus) {
  return status === "executed";
}

export function operatorProposalStatusMessage(status: OperatorProposalStatus) {
  if (status === "executed") return null;
  if (status === "loading") return "Checking proposal status on-chain...";
  if (status === "approved") {
    return "Execute the Squads vault transaction first to issue the license, then run operator execution.";
  }
  if (status === "other") {
    return "This proposal is not yet approved on-chain. Wait for signers to reach the threshold, then execute the Squads vault transaction.";
  }
  return "Could not verify proposal status on-chain.";
}
