import type { ViewingKeyPair } from "@cloak.dev/sdk";
import { computeAuditDiversifier } from "./hashing";

declare const CloakSDK = (window as any).CloakSDK;

export type ScopedAuditKey = {
  viewingKey: ViewingKeyPair;
  diversifier: Uint8Array;
};

export function deriveScopedAuditKey(
  cofreKeys: { view: ViewingKeyPair },
  scopeInput: import("./types").AuditDiversifierInput,
): ScopedAuditKey {
  const diversifier = computeAuditDiversifier(scopeInput);

  const nk = cofreKeys.view.vk_secret;

  if (!CloakSDK || !CloakSDK.deriveDiversifiedViewingKey) {
    throw new Error("Cloak SDK not available");
  }

  const viewingKey = await CloakSDK.deriveDiversifiedViewingKey(nk, diversifier);

  return { viewingKey, diversifier };
}
