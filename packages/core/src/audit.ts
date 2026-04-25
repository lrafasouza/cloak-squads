import type { ViewingKeyPair } from "@cloak.dev/sdk";
import { computeAuditDiversifier } from "./hashing";
import type { AuditDiversifierInput } from "./types";

export type ScopedAuditKey = {
  viewingKey: ViewingKeyPair;
  diversifier: Uint8Array;
};

function getCloakSDK(): {
  deriveDiversifiedViewingKey: (nk: unknown, diversifier: Uint8Array) => Promise<ViewingKeyPair>;
} {
  if (typeof window === "undefined") {
    throw new Error("Cloak SDK only available in the browser runtime");
  }
  const sdk = (window as unknown as { CloakSDK?: unknown }).CloakSDK;
  if (!sdk || typeof (sdk as { deriveDiversifiedViewingKey?: unknown }).deriveDiversifiedViewingKey !== "function") {
    throw new Error("Cloak SDK not available on window");
  }
  return sdk as {
    deriveDiversifiedViewingKey: (nk: unknown, diversifier: Uint8Array) => Promise<ViewingKeyPair>;
  };
}

export async function deriveScopedAuditKey(
  cofreKeys: { view: ViewingKeyPair },
  scopeInput: AuditDiversifierInput,
): Promise<ScopedAuditKey> {
  const diversifier = computeAuditDiversifier(scopeInput);
  const nk = (cofreKeys.view as unknown as { vk_secret: unknown }).vk_secret;
  const sdk = getCloakSDK();
  const viewingKey = await sdk.deriveDiversifiedViewingKey(nk, diversifier);
  return { viewingKey, diversifier };
}
