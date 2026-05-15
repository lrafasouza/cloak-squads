# ADR-001 — Cross-vault witness in `execute_with_license`

- **Status:** Accepted (2026-05-15)
- **Owners:** Aegis core team
- **Supersedes / superseded by:** —
- **Related audit findings:** P1-F-001 residual (architectural) · M4 in `docs/security/reports/2026-05-13-FINAL.md` §7

---

## 1. Context

The `cloak-gatekeeper` program issues short-TTL licenses that authorise the registered operator to consume a single Cloak deposit on behalf of a Squads-controlled vault. The license's PDA is bound to a `vault_index`, so a license minted for `vault[0]` cannot be loaded under `vault[1]` (audit Pass 1 closed F-001 by including `vault_index` in the seed).

But license consume (`execute_with_license`) only requires the **operator** to sign. Specifically, in `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs:69-82`:

```rust
#[derive(Accounts)]
pub struct ExecuteWithLicense<'info> {
    pub cofre: Account<'info, Cofre>,
    pub license: Account<'info, License>,   // bound via license.vault_index seed
    pub operator: Signer<'info>,            // <-- ONLY signer
    pub system_program: Program<'info, System>,
}
```

The Squads vault PDA that **issued** the license (i.e., the source-of-funds vault) is not part of `ExecuteWithLicense`. The on-chain trace therefore does not witness which vault funded the corresponding Cloak deposit at consume time.

In practice, the operator stitches license consume to a Squads transfer at the application layer. Today the application always uses the same `vault_index` end-to-end. A buggy or malicious operator could, however, mint a license tied to `vault[0]` (e.g., 3-of-5 governance) and pair it with a Squads transfer that drains `vault[1]` (e.g., 1-of-2 spending limit). The Squads program would validate the threshold for whichever vault actually signs the transfer; the gatekeeper would validate that the license exists and matches the payload hash; neither program would notice the cross-vault jump.

Audit severity: **6 (medium)** — not a direct drain path because Squads still enforces the threshold of whichever vault signs, but it lets the operator silently downgrade governance rigor when issuing vs consuming licenses.

## 2. Options considered

### Option A — Require source-vault co-signature

Change `ExecuteWithLicense` to also accept the source Squads vault PDA as a signer, derived from `license.vault_index`. The license consume tx would have to be bundled into the same Squads execute that draws funds, so the source vault PDA co-signs both the transfer and the license consume.

- **Pros:** removes the discretion. The chain witnesses end-to-end that license vault == funding vault.
- **Cons:** breaking change to the operator IDL and to every relayer / FE call site (`buildExecuteWithLicenseIx`, the operator console, the Squads bundle builder). Squads bundle ordering becomes load-bearing — easy to regress.
- **Effort:** ~1–2 weeks engineering plus an integration-test pass + a redeploy gated on multisig approval.

### Option B — Accept and document the operator-trust model

Keep the current account layout. Codify the operator-trust assumption in this ADR and reflect it in the operator runbook. Detect cross-vault jumps via off-chain reconciliation: the income-sync job already labels deposits with their funding `vault_index`; we cross-check at audit-export time that every consumed license was paired with a transfer from the matching vault.

- **Pros:** zero on-chain churn. Detection latency measured in seconds (next sync) rather than weeks.
- **Cons:** the chain alone does not prove cross-vault correctness — auditors / regulators reading the program transcript need an off-chain attestation. We carry a sustained "trust the operator" assumption.
- **Effort:** ~2 hours for this ADR + runbook entry + audit-export annotation.

## 3. Decision

**Adopt Option B for the v1 mainnet launch.** Re-evaluate Option A for the next major version of the program (when the IDL is otherwise breaking anyway).

Rationale:

- The operator is already trusted with the private key that signs license consumes. A malicious operator can do worse things (e.g., refuse to consume, refund themselves the deposit cap, leak deposit metadata) than a cross-vault swap. The cross-vault risk does not unlock a *new* class of attack — it's an instance of the same trust assumption.
- Source-vault co-signature is the right design for v2 but the wrong shape for a hotfix: it ripples through every Squads bundle builder and changes the operator interface during a period when we want surface-area minimised.
- Off-chain detection covers the practical concern (the auditor wants to know that consume vault == funding vault for every reconciled deposit). The audit-export pipeline already joins license rows with vault income; adding a `funding_vault_index` field on the joined output is a one-row schema change.

## 4. The threat model we are accepting

The operator is **trusted** to:

1. Issue licenses with the same `vault_index` as the Squads vault that ultimately funds the matching Cloak deposit.
2. Not pair a license issued by vault[X] with a Squads execute that draws from vault[Y].

The operator is **not trusted** to bypass:

- The Squads threshold of whichever vault actually signs the transfer (Squads enforces this regardless of operator).
- The license payload hash (the gatekeeper enforces this regardless of operator).
- The license TTL (the gatekeeper enforces this regardless of operator).
- The license revocation list (the gatekeeper enforces this regardless of operator).

If the operator violates the trust above, the on-chain transcript still proves the *Squads transfer* and the *license consume* are well-formed in isolation. The off-chain reconciliation report (audit export) is the artifact that joins them and would flag the mismatch.

## 5. Mitigations in place

| Mitigation | Where | What it covers |
|---|---|---|
| Operator authority is per-cofre and rotatable via `set_operator` (vault[0] signer required) | `programs/cloak-gatekeeper/src/instructions/set_operator.rs` | A compromised operator key can be revoked without redeploy. |
| Operator wallet is provisioned per cofre, not shared | Operator setup runbook | Compromise blast radius is one cofre, not the whole protocol. |
| Audit export joins license rows with vault income, surfaces source-vault address | `apps/web/lib/audit-data.ts`, `apps/web/lib/audit-sign.ts` | An auditor can detect cross-vault jumps after the fact. |
| Income sync labels deposits with the funding `vault_index` | `apps/web/lib/vault-income-sync.ts` | Provides the input the audit export uses for reconciliation. |
| Operator deposit cache is encrypted at rest and operator-only readable | `apps/web/lib/field-crypto.ts`, `apps/web/app/api/operator-deposit-cache/route.ts` | The operator cannot impersonate another operator; the cache is per-vault, per-operator. |

## 6. Action items shipped with this decision

- [x] Write this ADR.
- [ ] Add a `funding_vault_index` annotation column to the audit-export joined output (planned for the next audit-data sprint, after road-to-mainnet merge).
- [ ] Update `programs/cloak-gatekeeper/README.md` to reference this ADR in its security section.
- [ ] Add a sentence to the operator onboarding doc that mirrors §4 of this ADR.

## 7. Trigger conditions for reopening (i.e., flip to Option A)

We commit to revisiting Option A if **any** of the following becomes true:

1. We introduce a second operator role with different governance (e.g., a delegated relayer with weaker threshold) — the trust assumption no longer collapses.
2. A real cross-vault discrepancy is detected by the off-chain reconciliation (i.e., the off-chain mitigation already had work to do).
3. We introduce a vault type whose threshold is less than the cofre-administrator threshold (today: cofre admin is vault[0]; sub-vault thresholds are constrained to be ≤ vault[0] by product convention, so the issue is bounded — losing that convention escalates this ADR).
4. A program redeploy is required for unrelated reasons (so the breaking change cost is amortised).

## 8. References

- `docs/security/reports/2026-05-13-FINAL.md` §7 row M4
- `docs/security/reports/2026-05-11-program.md` Pass 1 F-001
- `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs:69-82`
- `programs/cloak-gatekeeper/src/instructions/issue_license.rs:50-65`
- `tests/integration/f1-cross-vault-replay.test.ts` (proves the PDA seed binding holds against intra-program confusion)
