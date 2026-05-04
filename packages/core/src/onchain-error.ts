function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    if (error.message) return error.message;
    if (error.cause instanceof Error && error.cause.message) return error.cause.message;
    return error.name || "Unknown error";
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function matchesCode(message: string, decimal: number): boolean {
  const hex = decimal.toString(16);
  return (
    message.includes(`Error Number: ${decimal}`) ||
    message.includes(`"Custom":${decimal}`) ||
    message.includes(`0x${hex}`)
  );
}

export function translateOnchainError(error: unknown): string {
  const message = errorText(error);

  // ── Squads V4 program errors ──────────────────────────────────────────
  if (message.includes("NotAMember") || matchesCode(message, 6005)) {
    return "Connected wallet is not a member of this Squads multisig. Switch to a member wallet, then try again.";
  }

  if (message.includes("Unauthorized") || matchesCode(message, 6004)) {
    return "Your wallet does not have permission to perform this action on this multisig.";
  }

  if (message.includes("InvalidProposalStatus") || matchesCode(message, 6008)) {
    return "This action cannot be performed because the proposal is in the wrong state. Reload the page to see the current status.";
  }

  if (message.includes("StaleProposal") || matchesCode(message, 6007)) {
    return "This proposal is stale — the multisig configuration changed after it was created. It can no longer be approved or executed.";
  }

  if (message.includes("AlreadyApproved") || matchesCode(message, 6010)) {
    return "You have already approved this proposal. Each member can only vote once.";
  }

  if (message.includes("AlreadyRejected") || matchesCode(message, 6011)) {
    return "You have already rejected this proposal. Each member can only vote once.";
  }

  if (message.includes("AlreadyCancelled") || matchesCode(message, 6012)) {
    return "This proposal has already been cancelled.";
  }

  if (message.includes("TimeLockNotReleased") || matchesCode(message, 6021)) {
    return "The time lock period has not elapsed yet. Wait for the time lock to expire before executing.";
  }

  // ── Solana / runtime errors ───────────────────────────────────────────
  if (message.includes("AccountNotInitialized") || matchesCode(message, 3012)) {
    return "Cofre account is not initialized for this multisig. Initialize the cofre before creating or executing private send proposals.";
  }

  if (message.includes("insufficient lamports")) {
    return "The paying account does not have enough SOL to complete this transaction. Add devnet SOL, then try again.";
  }

  if (
    error instanceof Error &&
    error.name === "WalletSendTransactionError" &&
    (!error.message || error.message.trim() === "")
  ) {
    return "Wallet rejected or failed to send the transaction. Make sure your wallet is unlocked and you approved the signing request.";
  }

  return message || "Transaction failed. Please try again.";
}

export function translatedOnchainError(error: unknown): Error {
  return new Error(translateOnchainError(error));
}
