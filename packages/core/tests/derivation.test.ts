import { generateCloakKeys } from "@cloak.dev/sdk";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, test, vi } from "vitest";
import { deriveOperatorCloakKeys, deriveSignerDecryptKeypair } from "../src/derivation";

const multisig = new PublicKey(new Uint8Array(32).fill(7));
const signature = new Uint8Array(64).fill(9);

describe("derivation", () => {
  test("deriveOperatorCloakKeys is deterministic for the same multisig and wallet signature", async () => {
    vi.stubGlobal("window", { generateCloakKeys });
    const signMessage = vi.fn(async () => signature);

    const first = await deriveOperatorCloakKeys(multisig, signMessage);
    const second = await deriveOperatorCloakKeys(multisig, signMessage);

    expect(first.master.seedHex).toBe(second.master.seedHex);
    expect(first.spend.sk_spend_hex).toBe(second.spend.sk_spend_hex);
    expect(signMessage).toHaveBeenCalledWith(
      new TextEncoder().encode(`cloak-squads-operator-v1:${multisig.toBase58()}`),
    );
  });

  test("deriveSignerDecryptKeypair returns a valid nacl box keypair shape", async () => {
    const keypair = await deriveSignerDecryptKeypair(multisig, async () => signature);

    expect(keypair.publicKey).toHaveLength(32);
    expect(keypair.secretKey).toHaveLength(32);
    expect(Array.from(keypair.publicKey)).not.toEqual(new Array(32).fill(0));
  });
});
