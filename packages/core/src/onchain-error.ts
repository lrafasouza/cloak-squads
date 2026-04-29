function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function translateOnchainError(error: unknown): string {
  const message = errorText(error);

  if (
    message.includes("NotAMember") ||
    message.includes("Error Number: 6005") ||
    message.includes('"Custom":6005')
  ) {
    return "Connected wallet is not a member of this Squads multisig. Switch to a member wallet, then try again.";
  }

  if (message.includes("AccountNotInitialized") || message.includes("Error Number: 3012")) {
    return "Cofre account is not initialized for this multisig. Initialize the cofre before creating or executing private send proposals.";
  }

  if (message.includes("insufficient lamports")) {
    return "The paying account does not have enough SOL to complete this transaction. Add devnet SOL, then try again.";
  }

  return message;
}

export function translatedOnchainError(error: unknown): Error {
  return new Error(translateOnchainError(error));
}
