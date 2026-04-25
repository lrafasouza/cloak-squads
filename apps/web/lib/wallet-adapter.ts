"use client";

import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export type MessageSignerWallet = {
  publicKey: { toBase58(): string } | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

export type TransactionSignerWallet = {
  publicKey: import("@solana/web3.js").PublicKey | null;
  signTransaction?: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  sendTransaction?: (
    transaction: Transaction | VersionedTransaction,
    connection: import("@solana/web3.js").Connection,
    options?: import("@solana/web3.js").SendOptions,
  ) => Promise<string>;
};

export function requirePublicKey(wallet: { publicKey: unknown }): asserts wallet is {
  publicKey: import("@solana/web3.js").PublicKey;
} {
  if (!wallet.publicKey) {
    throw new Error("Connect a wallet before continuing.");
  }
}

export function getWalletSignMessage(wallet: MessageSignerWallet) {
  if (!wallet.publicKey) {
    throw new Error("Connect a wallet before deriving Cloak keys.");
  }
  if (typeof wallet.signMessage !== "function") {
    throw new Error("This wallet does not expose signMessage. Use Phantom or Solflare for F1.");
  }

  return async (message: Uint8Array) => wallet.signMessage?.(message) ?? new Uint8Array();
}

export function getWalletTransactionSender(
  wallet: TransactionSignerWallet,
  connection: import("@solana/web3.js").Connection,
) {
  if (!wallet.publicKey) {
    throw new Error("Connect a wallet before sending a transaction.");
  }
  if (typeof wallet.sendTransaction !== "function") {
    throw new Error("This wallet cannot send transactions from the browser.");
  }
  const sendTransaction = wallet.sendTransaction;

  return (transaction: Transaction | VersionedTransaction, options?: import("@solana/web3.js").SendOptions) =>
    sendTransaction(transaction, connection, options);
}
