/**
 * Devnet integration test — calls real Cloak via cloakDeposit() wrapper.
 *
 * Skipped by default. Enable with:
 *   RUN_DEVNET_TESTS=1 SOLANA_KEYPAIR=~/.config/solana/cloak-devnet.json \
 *     node --experimental-strip-types tests/devnet/cloak-deposit.devnet.test.ts
 *
 * Cost: ~0.01 SOL per run. Requires:
 *   - SOLANA_KEYPAIR pointing to a funded devnet keypair
 *   - https://api.devnet.cloak.ag reachable
 *   - https://api.devnet.solana.com reachable
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Connection, Keypair } from "@solana/web3.js";
import { cloakDeposit } from "../../packages/core/src/cloak-deposit";

const ENABLED = process.env.RUN_DEVNET_TESTS === "1";

test("cloakDeposit deposits 0.01 SOL into Cloak devnet shield pool", { skip: !ENABLED }, async () => {
  // Pre-flight: relay healthcheck. If down, skip rather than fail.
  let relayUp = false;
  try {
    const r = await fetch("https://api.devnet.cloak.ag/range-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });
    relayUp = r.status < 500; // 4xx is fine — relay is reachable
  } catch {
    relayUp = false;
  }
  if (!relayUp) {
    console.error("[devnet] relay api.devnet.cloak.ag unreachable, skipping");
    return;
  }

  const keypairPath = process.env.SOLANA_KEYPAIR;
  if (!keypairPath) throw new Error("SOLANA_KEYPAIR env var is required");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf-8")) as number[]),
  );

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  assert.ok(balance >= 50_000_000, `payer needs ≥0.05 SOL, has ${balance}`);

  const result = await cloakDeposit(connection, payer, 10_000_000n); // 0.01 SOL min

  assert.ok(result.signature.length >= 64, "signature should be base58 ≥64 chars");
  assert.ok(typeof result.leafIndex === "number");
  assert.ok(result.leafIndex >= 0);
  assert.equal(result.spendKeyHex.length, 64);
  assert.equal(result.blindingHex.length, 64);

  // Settlement delay per docs.cloak.ag/development/devnet
  await new Promise((r) => setTimeout(r, 20_000));

  const status = await connection.getSignatureStatus(result.signature);
  assert.ok(status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized");
});
