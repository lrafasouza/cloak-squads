export type BoxKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

/**
 * NOT IMPLEMENTED — deterministic operator/cloak-key derivation is currently
 * delegated to the Cloak SDK at the call site (see operator/page.tsx and
 * cloak-deposit.ts) instead of through this package.
 *
 * The original idea was to centralize derivation here, but the Cloak SDK's
 * `generateCloakKeys` already covers this in a way that depends on browser
 * runtime injection — replicating it server-side is a separate workstream.
 *
 * Kept as throwing stubs so anyone importing them fails loud at runtime
 * instead of getting silent zero-value keys. Drop these exports when the
 * dependency on `@cloak.dev/sdk-devnet` graduates to first-party code.
 */
export async function deriveOperatorCloakKeys(): Promise<never> {
  throw new Error(
    "deriveOperatorCloakKeys is not implemented — call generateCloakKeys from @cloak.dev/sdk-devnet directly.",
  );
}

export async function deriveSignerDecryptKeypair(): Promise<never> {
  throw new Error(
    "deriveSignerDecryptKeypair is not implemented — see comment in derivation.ts.",
  );
}
