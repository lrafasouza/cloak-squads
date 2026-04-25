export type PayloadInvariants = {
  nullifier: Uint8Array;
  commitment: Uint8Array;
  amount: bigint;
  tokenMint: import("@solana/web3.js").PublicKey;
  recipientVkPub: Uint8Array;
  nonce: Uint8Array;
};

export type AuditDiversifierInput = {
  linkId: string;
  scope: "full" | "amounts_only" | "time_ranged";
  startDate: bigint;
  endDate: bigint;
};

export type EncryptedViewKeyEntry = {
  signer: Uint8Array;
  ephemeralPk: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  addedAt: bigint;
};
