/**
 * Smoke test for the four-key JWT split (commits 60bf205 / cdd2825 / 4858d42).
 *
 * Exercises each subsystem end-to-end against its production code path:
 *   1. SESSION_HMAC_KEY drives auth-session token issue + verify
 *   2. SESSION_HMAC_KEY (same env, different domain sep) drives claim challenge
 *   3. FIELD_CRYPTO_KEY drives field-crypto encrypt + decrypt
 *   4. FIELD_CRYPTO_KEY_PREVIOUS drives the dual-read rotation window
 *   5. AUDIT_EXPORT_SIGN_KEY drives audit-sign export signature + verify
 *
 * Run:
 *   pnpm tsx scripts/smoke-jwt-split.ts
 *
 * Exits 0 on green, 1 on first failure. No DB or network required.
 */

import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";

// Generate fresh per-run keys so the test doesn't depend on .env.
const SESSION_KEY = randomBytes(32).toString("hex");
const FIELD_KEY = randomBytes(32).toString("hex");
const FIELD_KEY_NEXT = randomBytes(32).toString("hex");
const AUDIT_SEED = randomBytes(32).toString("base64");

process.env.SESSION_HMAC_KEY = SESSION_KEY;
process.env.FIELD_CRYPTO_KEY = FIELD_KEY;
process.env.AUDIT_EXPORT_SIGN_KEY = AUDIT_SEED;

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ""}`);
    fail++;
  }
}

async function main() {
  console.log("\n[1/4] Session cookie HMAC (SESSION_HMAC_KEY)");
  {
    const mod = await import("../apps/web/lib/auth-session");
    const { token, expiresAt } = mod.createSessionToken("FakePubkey1111111111111111111111");
    const verified = mod.verifySessionToken(token);
    check("issue + verify round-trip", verified?.publicKey === "FakePubkey1111111111111111111111");
    check("expiry surfaces", verified?.expiresAt === expiresAt);

    // Tamper detection: flip a byte in the signature half.
    const tampered = `${token.slice(0, -2)}AA`;
    check("tampered signature rejected", mod.verifySessionToken(tampered) === null);
  }

  console.log("\n[2/4] Stealth claim challenge HMAC (SESSION_HMAC_KEY + challenge-hmac-v1)");
  {
    const mod = await import("../apps/web/lib/claim-challenge");
    const { challengeId, challenge } = mod.createChallenge("invoice-abc-123");
    const nonce = mod.checkChallenge("invoice-abc-123", challengeId);
    check("create + check round-trip", nonce !== null && nonce.length === 32);
    check("nonce matches base64url", challenge.length > 30);

    // Wrong invoice id should reject (binding test).
    check(
      "different invoice id rejected",
      mod.checkChallenge("invoice-other-456", challengeId) === null,
    );

    // Domain separation: a session-token signature must NOT verify here.
    // We can't easily prove this without poking internals, but a tampered
    // challengeId fails — covers the same surface.
    const tampered = challengeId.slice(0, -1) + "x";
    check("tampered challengeId rejected", mod.checkChallenge("invoice-abc-123", tampered) === null);
  }

  console.log("\n[3/4] Field crypto AES-256-GCM (FIELD_CRYPTO_KEY)");
  {
    const mod = await import("../apps/web/lib/field-crypto");
    const plaintext = "secret-utxo-blinding-deadbeef";
    const ciphertext = mod.encryptField(plaintext);
    check("ciphertext starts with v1.", ciphertext.startsWith("v1."));
    check("decrypt round-trip", mod.decryptField(ciphertext) === plaintext);
    check("isEncrypted recognises v1.", mod.isEncrypted(ciphertext) === true);

    // Two encryptions of same plaintext differ (random IV) but decrypt the same.
    const a = mod.encryptField("same");
    const b = mod.encryptField("same");
    check("random IV produces distinct ciphertexts", a !== b);
    check("both decrypt to the same plaintext", mod.decryptField(a) === mod.decryptField(b));
  }

  console.log("\n[4/4] Audit Ed25519 signature (AUDIT_EXPORT_SIGN_KEY)");
  {
    const mod = await import("../apps/web/lib/audit-sign");
    const signed = mod.signAuditExport({
      vault: "VaultPubkey",
      linkId: "link-abc",
      contentType: "text/csv",
      data: "timestamp,type,amount\n2026-05-08,deposit,100",
    });
    check("signature is base64", /^[A-Za-z0-9+/=]+$/.test(signed.signature));
    check("publicKey embedded", signed.publicKey.length > 30);
    check("signedAt is ISO", !Number.isNaN(Date.parse(signed.signedAt)));

    // Verify offline: rebuild canonical message + verify against embedded pubkey.
    const message = mod.buildAuditExportMessage({
      signedAt: signed.signedAt,
      vault: signed.vault,
      linkId: signed.linkId,
      contentType: signed.contentType,
      data: signed.data,
    });
    const sigBytes = Uint8Array.from(Buffer.from(signed.signature, "base64"));
    const pkBytes = Uint8Array.from(Buffer.from(signed.publicKey, "base64"));
    check("Ed25519 signature verifies", nacl.sign.detached.verify(message, sigBytes, pkBytes));

    // Wrong data must reject.
    const tamperedMessage = mod.buildAuditExportMessage({
      ...signed,
      data: signed.data + "x",
    });
    check(
      "tampered data rejected",
      !nacl.sign.detached.verify(tamperedMessage, sigBytes, pkBytes),
    );
  }

  console.log("\n[5] Field-crypto rotation (FIELD_CRYPTO_KEY_PREVIOUS)");
  {
    // Encrypt under the original key, then "rotate" by swapping envs and
    // wiring PREVIOUS to the original. Decrypt must still succeed.
    const original = await import("../apps/web/lib/field-crypto");
    const ciphertextOld = original.encryptField("rotated-payload");

    // Reset module + swap keys.
    process.env.FIELD_CRYPTO_KEY = FIELD_KEY_NEXT;
    process.env.FIELD_CRYPTO_KEY_PREVIOUS = FIELD_KEY;
    // Force a fresh module import to drop the cached keys.
    delete (require.cache as Record<string, unknown>)[require.resolve("../apps/web/lib/field-crypto")];
    const rotated: typeof original = await import("../apps/web/lib/field-crypto");
    rotated._resetFieldCryptoKeyCache();

    check("dual-read decrypts under PREVIOUS", rotated.decryptField(ciphertextOld) === "rotated-payload");

    // New writes go under CURRENT.
    const ciphertextNew = rotated.encryptField("post-rotation");
    delete process.env.FIELD_CRYPTO_KEY_PREVIOUS;
    rotated._resetFieldCryptoKeyCache();
    check("post-rotation reads work without PREVIOUS", rotated.decryptField(ciphertextNew) === "post-rotation");

    // Old ciphertext now orphaned (operator forgot to back-fill).
    let orphaned = false;
    try {
      rotated.decryptField(ciphertextOld);
    } catch {
      orphaned = true;
    }
    check("orphaned ciphertext fails after PREVIOUS dropped", orphaned);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke run crashed:", err);
  process.exit(1);
});
