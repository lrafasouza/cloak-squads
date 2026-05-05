-- Void stealth invoices that pre-date the signPubkey field.
-- These invoices cannot be claimed securely because the server has no way to
-- verify Ed25519 ownership of the stealth keypair without signPubkey.
-- The challenge-response in /claim-data now REQUIRES signPubkey (no bypass).
--
-- Affected invoices: created before migration 20260503000000_stealth_sign_pubkey
-- was deployed and populated with a signPubkey at invoice creation time.
--
-- Action: status → 'voided', memo explains the reason.

UPDATE "StealthInvoice"
SET
  "status" = 'voided',
  "memo"   = COALESCE("memo", '') ||
             CASE WHEN "memo" IS NULL OR "memo" = '' THEN ''
                  ELSE ' | ' END ||
             'pre-S4 security upgrade: re-issue invoice'
WHERE
  "signPubkey" IS NULL
  AND "status" NOT IN ('claimed', 'voided');
