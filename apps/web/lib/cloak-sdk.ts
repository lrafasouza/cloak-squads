"use client";

import {
  CloakSDK,
  LocalStorageAdapter,
  type CloakKeyPair,
  type CloakNote,
  type Network,
  type ProofResult,
  RootNotFoundError,
  type TransferOptions,
  generateCloakKeys,
  generateWithdrawRegularProof,
  getDefaultCircuitsPath,
  isRootNotFoundError,
  scanTransactions,
  setCircuitsPath,
  verifyAllCircuits,
} from "@cloak.dev/sdk-devnet";
import { PublicKey, type Connection, type Transaction } from "@solana/web3.js";
import { publicEnv } from "./env";

export type BrowserCloakWallet = {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction>(transaction: T) => Promise<T>;
  sendTransaction?: (
    transaction: Transaction,
    connection: Connection,
    options?: unknown,
  ) => Promise<string>;
};

export type ProofProgressStep = "load-circuits" | "generate-witness" | "prove";

export function getCloakNetwork(): Network {
  return publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta"
    ? "mainnet"
    : publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER;
}

export async function configureCloakCircuits() {
  const circuitsPath = await getDefaultCircuitsPath();
  setCircuitsPath(circuitsPath);
  return circuitsPath;
}

export async function verifyCloakCircuits() {
  const circuitsPath = await configureCloakCircuits();
  return verifyAllCircuits(circuitsPath);
}

export function createCloakSdk(wallet: BrowserCloakWallet, cloakKeys?: CloakKeyPair) {
  if (!wallet.publicKey) {
    throw new Error("Connect a wallet before initializing Cloak SDK.");
  }

  const sdkWallet: ConstructorParameters<typeof CloakSDK>[0]["wallet"] = {
    publicKey: wallet.publicKey,
  };
  if (wallet.signTransaction) {
    sdkWallet.signTransaction = wallet.signTransaction;
  }
  if (wallet.sendTransaction) {
    sdkWallet.sendTransaction = wallet.sendTransaction;
  }

  const config: ConstructorParameters<typeof CloakSDK>[0] = {
    network: getCloakNetwork(),
    wallet: sdkWallet,
    storage: new LocalStorageAdapter("cloak-squads-notes", "cloak-squads-keys"),
    programId: publicKeyFromEnv(publicEnv.NEXT_PUBLIC_CLOAK_PROGRAM_ID),
    relayUrl: publicEnv.NEXT_PUBLIC_CLOAK_RELAY_URL,
    debug: process.env.NODE_ENV !== "production",
  };
  if (cloakKeys) {
    config.cloakKeys = cloakKeys;
  }

  return new CloakSDK(config);
}

export function generateOperatorCloakKeys(seed?: Uint8Array) {
  return generateCloakKeys(seed);
}

export async function scanCloakTransactions(options: Parameters<typeof scanTransactions>[0]) {
  return scanTransactions(options);
}

export async function generateRegularProofWithProgress(
  inputs: Parameters<typeof generateWithdrawRegularProof>[0],
  onStep?: (step: ProofProgressStep, detail?: string) => void,
): Promise<ProofResult> {
  onStep?.("load-circuits", "Loading pinned Cloak circuits");
  const circuitsPath = await configureCloakCircuits();
  onStep?.("generate-witness", "Generating witness");
  onStep?.("prove", "Generating Groth16 proof");
  return generateWithdrawRegularProof(inputs, circuitsPath);
}

export async function runWithFreshMerkleRetry<T>(
  execute: () => Promise<T>,
  refresh: () => Promise<void>,
  maxRetries = 1,
) {
  let attempts = 0;
  while (true) {
    try {
      return await execute();
    } catch (error) {
      if (!(error instanceof RootNotFoundError || isRootNotFoundError(error)) || attempts >= maxRetries) {
        throw error;
      }
      attempts += 1;
      await refresh();
    }
  }
}

export async function sendPrivateTransfer(
  sdk: CloakSDK,
  connection: Connection,
  note: CloakNote,
  recipient: PublicKey,
  amount: number,
  options?: TransferOptions,
) {
  return sdk.send(connection, note, [{ recipient, amount }], options);
}

function publicKeyFromEnv(value: string) {
  return new PublicKey(value);
}
