import { PublicKey } from "@solana/web3.js";
import { describe, expect, test } from "vitest";
import { assertCofreInitialized } from "../../packages/core/src/cofre-status";
import { cofrePda } from "../../packages/core/src/pda";

const gatekeeperProgram = new PublicKey("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");
const otherProgram = new PublicKey("11111111111111111111111111111111");
const multisig = new PublicKey("4UyJQecmT5irKwbgWyW3WeARsGfz8vii2cxsXBz5PMt5");

describe("assertCofreInitialized", () => {
  test("throws an actionable error when the cofre account is missing", async () => {
    await expect(
      assertCofreInitialized({
        connection: { getAccountInfo: async () => null },
        multisig,
        gatekeeperProgram,
      }),
    ).rejects.toThrow(
      `Cofre is not initialized for multisig ${multisig.toBase58()}`,
    );
  });

  test("throws when the cofre PDA is owned by another program", async () => {
    await expect(
      assertCofreInitialized({
        connection: {
          getAccountInfo: async () => ({
            owner: otherProgram,
          }),
        },
        multisig,
        gatekeeperProgram,
      }),
    ).rejects.toThrow(`but it is owned by ${otherProgram.toBase58()}`);
  });

  test("returns the cofre PDA when the account exists under the gatekeeper program", async () => {
    const expected = cofrePda(multisig, gatekeeperProgram)[0];

    await expect(
      assertCofreInitialized({
        connection: {
          getAccountInfo: async () => ({
            owner: gatekeeperProgram,
          }),
        },
        multisig,
        gatekeeperProgram,
      }),
    ).resolves.toEqual(expected);
  });
});
