export type BoxKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export async function deriveOperatorCloakKeys(): Promise<never> {
  throw new Error("deriveOperatorCloakKeys: not yet wired — requires Cloak SDK key generation");
}

export async function deriveSignerDecryptKeypair(): Promise<never> {
  throw new Error("deriveSignerDecryptKeypair: not yet wired — requires Cloak SDK key generation");
}
