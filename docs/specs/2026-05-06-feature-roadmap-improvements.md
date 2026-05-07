# Aegis — Feature Roadmap & Implementation Spec

**Date:** 2026-05-06
**Author:** Rafael (with Claude analysis pass)
**Status:** Tier 1 in flight, Tier 2/3 specced for next sprint

---

## Context

Comprehensive feature scan of Aegis vs Squads.xyz vs the rest of the Solana
privacy stack (Arcium, Umbra, Darklake) plus crypto-invoicing competitors
(Request Finance, BitPay) surfaced three categories of work:

1. **Promises half-kept inside Aegis** — features that exist but ship with
   visible gaps (audit page exports mock data; sub-vault private ops are
   blocked by gatekeeper hardcode; spending limits don't bridge to Cloak).
2. **Squads parity gaps** — recurring payments, vesting, time locks, custom
   roles, fee relayer, accounting integrations.
3. **Privacy moat reinforcement** — the bearer-style invoice link is the
   marquee differentiator no one else in the Solana privacy stack covers,
   because they all stop at the wallet-to-wallet shielded payment.

This doc is the spec for the work; the README is the user-facing pitch.

---

## Tier 1 — Must ship before next demo (this sprint)

### 1. Bearer Invoice — claim link without recipient wallet

**Problem.** Today `/api/stealth` requires `recipientWallet` at creation
time, so the sender must already know the destination wallet. Real
freelance / vendor flows look like *"I'll post a payment link on my
website and let the buyer pick the destination."* That's a
bearer-instrument invoice, and Aegis can't issue one.

**Why we can do it.** The Cloak `fullWithdraw` instruction takes the
recipient address at withdraw time, not deposit time. The deposit-time
binding to a wallet is a UI choice, not a protocol constraint. We
already pass the UTXO ownership keypair through the URL fragment.

**Threat model delta.** "Bound" invoices today encode the recipient in the
proposal memo and the UTXO viewing key. "Bearer" invoices replace the
viewing key with one derived from the link secret — anyone with the link
can claim. Trade-off: a leaked link is bearer cash. We surface this as a
prominent badge in the UI and short link expiry default (24h vs 7d for
bound).

**Schema.**

```prisma
model StealthInvoice {
  // ...existing fields...
  recipientWallet  String?   // was required, now optional (nullable for bearer)
  mode             String    @default("bound")  // "bound" | "bearer"
  bearerExpiresAt  DateTime? // shorter expiry for bearer mode
  // recipient_vk is no longer the wallet for bearer mode — derived from link secret
}
```

Migration: `20260506_bearer_invoice` — adds `mode`, makes `recipientWallet`
nullable, backfills `mode='bound'` for existing rows.

**API changes.** `app/api/stealth/route.ts`:

```ts
const stealthInvoiceCreateSchema = z.object({
  // ...
  recipientWallet: z.string().optional().refine(...),
  mode: z.enum(["bound", "bearer"]).default("bound"),
  expiresInHours: z.number().int().min(1).max(720).optional(), // 1h..30d
});

// Validation: if mode === "bearer", recipientWallet must be absent.
// if mode === "bound", recipientWallet must be present.
```

**UI changes.** `app/vault/[multisig]/invoice/page.tsx`:

- Add `mode` toggle ("Bound to wallet" / "Bearer link") with help text.
- Hide `recipientWallet` input when bearer mode.
- For bearer mode, show:
  - **Red warning panel:** "Anyone with this link can claim — treat as bearer cash."
  - **Expiry selector** — default 24h, max 30d, min 1h.
  - **Optional email field** — UI-only for now; we don't actually send email
    (logged for v2 when email infra lands).

**Claim flow changes.** `app/claim/[stealthId]/page.tsx`:

- Detect bearer mode from API metadata.
- For bearer mode: show "Where should we send the payment?" input
  (Solana address) — pre-fill with connected wallet but allow override.
- Operator-side execute path uses the recipient address chosen at claim
  time when invoking Cloak `fullWithdraw`.

**Operator delta.** Operator inbox already gets the claim metadata when
the recipient claims. Today `recipient_vk` is the proposer-supplied
wallet; for bearer it's the claim-time wallet. The operator-side change
is just *"read the recipient from the claim record, not the invoice
record."*

**Tests.** Devnet flow: create bearer invoice → share link to second
wallet → claim into a third wallet → verify Cloak deposit and withdraw
land at the third wallet, not the second wallet (i.e. claim-time wallet
override works).

---

### 2. Audit — real data + access log + signed exports

**Problem.** Three concrete issues:

1. `apps/web/app/vault/[multisig]/audit/page.tsx` exports CSV/JSON via
   `generateDeterministicMockData(linkId, 8)` — the admin's own export
   is fake. The public viewer at `app/audit/[linkId]/page.tsx` already
   pulls real proposals/payrolls; the admin path lags.
2. No access log. Once a link is shared, no one knows whether the
   regulator opened it, when, or how often.
3. Exports are unsigned plaintext. Claim "Ed25519-signed" in the README
   is aspirational — no signature is actually attached to the exported
   files.

**Schema.**

```prisma
model AuditAccessLog {
  id            String   @id @default(uuid())
  auditLinkId   String
  accessedAt    DateTime @default(now())
  ip            String?
  userAgent     String?  // truncated to 256 chars
  action        String   // "view" | "export_csv" | "export_json"
  AuditLink     AuditLink @relation(fields: [auditLinkId], references: [id], onDelete: Cascade)

  @@index([auditLinkId])
  @@index([auditLinkId, accessedAt])
}
```

Migration: `20260506_audit_access_log`.

`AuditLink` gets a back-relation `accessLogs AuditAccessLog[]`.

**API changes.**

- `app/api/audit/[linkId]/route.ts` GET — record an "view" entry on
  every access (rate-limited to 1/min/IP to avoid log spam).
- New route: `app/api/audit-links/[vault]/[linkId]/access-log/route.ts` —
  GET, vault-member only, returns access log for one link.
- `app/api/audit/[linkId]/export/route.ts` — POST that takes scope +
  filters, returns the **server-signed** CSV/JSON. Server holds the
  Ed25519 signing key (env: `AUDIT_EXPORT_SIGN_KEY` = base64 of 32-byte
  seed). Output format: `{ "data": <export-as-string>, "signature":
  "<base64>", "publicKey": "<base64>", "signedAt": "ISO8601" }`. The
  signature covers `signedAt || vault || linkId || data`. We log
  the export in `AuditAccessLog`.

**Admin UI changes.** `app/vault/[multisig]/audit/page.tsx`:

- Replace `generateDeterministicMockData` with the same fetch the public
  viewer uses (consolidate into a shared lib `lib/audit-data.ts`).
- Move CSV/JSON export from client-side to the new server-signed route
  so the file the auditor receives carries a verifiable signature.
- New panel: "Recent access" — shows last 50 access log entries per
  link (collapsed under each link row).
- Per-link badge: "👁 N views in last 7d".

**Public viewer enhancement.** Surface a "verified export" callout that
explains: every CSV/JSON download is signed by the Aegis backend; the
signature can be checked offline against the public key in `metadata.json`.

**Tests.** unit test for export signing (deterministic given fixed
key + payload); integration test that two views in <60s only log once.

---

### 3. Recurring Payments — scaffold (no cron yet)

**Problem.** Squads has `Recipients` for recurring payments. Aegis doesn't
— a DAO wanting monthly payroll has to redo the entire payroll wizard
every cycle.

**Scope choice.** This sprint we ship the **directory and execute-now
button** — the recurring schedule lives in the DB, but execution is
manual ("Run this month's payroll"). A real cron is deferred until
the sub-vault gatekeeper fix lands (you don't want background jobs
hitting a known-broken code path).

**Schema.**

```prisma
model RecurringPayment {
  id            String   @id @default(uuid())
  cofreAddress  String
  vaultIndex    Int      @default(0)
  label         String   // "Q2 advisor — Alice"
  recipient     String   // Solana address (or empty if bearer)
  mode          String   // "bound" | "bearer"
  amount        String   // base units (lamports for SOL)
  mint          String   // SOL mint or SPL mint
  cadence       String   // "weekly" | "biweekly" | "monthly" | "quarterly"
  nextDueAt     DateTime
  lastRunAt     DateTime?
  privacy       String   @default("private")  // "private" | "public"
  status        String   @default("active")   // "active" | "paused" | "cancelled"
  createdBy     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([cofreAddress])
  @@index([cofreAddress, status])
  @@index([nextDueAt])
}
```

Migration: `20260506_recurring_payments`.

**API.** `app/api/recurring/[vault]/route.ts` GET/POST,
`/[vault]/[id]/route.ts` PATCH/DELETE,
`/[vault]/[id]/run/route.ts` POST (vault-member only — creates the
proposal exactly like SendModal does, then bumps `nextDueAt`).

**UI.** `app/vault/[multisig]/recurring/page.tsx` —
list view with Run / Pause / Edit / Delete. "Add recurring" opens a
modal that mirrors SendModal but adds cadence picker.

**Sidebar entry.** New nav item under "Operations" group.

**Tests.** Devnet — create monthly recurring → click Run → proposal
created → execute → run again → second proposal lands.

---

## Tier 2 — Next sprint

### 4. Sub-vault gatekeeper parametrization

Already specced in `docs/specs/2026-05-06-gatekeeper-vault-index-parametrization.md`.
~7-8h, requires Anchor program redeploy. Critical for the integrity of
the sub-vaults pitch.

### 5. Time locks

Squads v4 supports `time_lock` parameter on the multisig config. Aegis
inherits this from `@sqds/multisig` v4 — the on-chain support is free.
What we need:

- UI in Settings: "Time lock" slider (0..7 days)
- New proposal type from `squads-sdk.ts`:
  `createSetTimeLockProposal(seconds)` (config tx, identical pattern to
  threshold change)
- Proposals page surfaces "Locked until <time>" countdown for any
  proposal under time lock; Execute button disabled until then.

Effort: ~3-4h.

### 6. Custom roles

Today every member has full power. Squads Business has roles. We add a
DB-side overlay (no on-chain change) that gates UI actions:

```prisma
model VaultRole {
  cofreAddress String
  member       String
  role         String  // "admin" | "proposer" | "viewer" | "executor"
  @@id([cofreAddress, member])
}
```

Permission map:
- `admin` — everything (default)
- `proposer` — can create proposals, can't execute or edit members
- `executor` — can sign+execute, can't create
- `viewer` — read-only

Effort: ~6-8h. Wires into every action's `requireVaultMember` middleware
plus client-side disabled states.

### 7. Privacy bridge for spending limits

Today using a spending limit goes public (SystemProgram.transfer). To
keep the privacy promise, the spending-limit-use instruction needs to
deposit into the Cloak pool instead. Memorized as v2 follow-up; about
~3-4h once the gatekeeper parametrization lands (because spending
limits also live on a per-vault-index basis).

### 8. Proof-of-payment exports

Selective disclosure with cryptographic proof — give an auditor a
file that proves "vault X paid Y SOL into Cloak that was eventually
withdrawn to Z" without revealing the full UTXO. Requires Groth16
witness export + a verifier WASM bundle. Effort ~4-5h, needs
`@cloak.dev/sdk-devnet` to expose a witness extractor.

### 9. Multi-operator failover

Add `backupOperator` to `Cofre` (Anchor change) plus heartbeat in DB:

```prisma
model OperatorHeartbeat {
  cofreAddress String   @id
  operator     String
  lastSeenAt   DateTime
}
```

If primary missed >1h heartbeat, UI surfaces "Operator offline — escalate
to backup" with a one-click switch. ~3-4h.

---

## Tier 3 — Ecosystem (later)

### 10. Streamflow integration
Vesting + salary streams routed through Cloak. Streamflow exposes
`@streamflow/stream` SDK — wrap their `create` instruction inside the
Aegis proposal flow and pipe execution through the operator. ~5-6h.

### 11. Sphere fiat off-ramp
Operator can off-ramp a confirmed deposit to USD via Sphere. Requires
Sphere API account + KYC. ~8h once API access is provisioned.

### 12. Mobile-first PWA
Manifest, service worker, offline shell, claim flow optimized for
mobile (camera QR scan, Solana mobile wallet adapter). ~3-4h.

### 13. MCP server
Spec already exists in `docs/specs/2026-05-05-aegis-mcp-server.md`.
Lets agents drive Aegis (create vaults, propose, execute) from outside.
~6-8h.

### 14. Notifications
**SKIPPED per direction.** Telegram bot, Slack webhook, email — not in
scope this sprint.

---

## Cross-cutting

### Memory updates
After Tier 1 lands, update `MEMORY.md`:
- New entry pointing at this doc
- Note that bearer-invoice is shipped (changes the sub-vault constraint
  story too — bearer invoices route through vault[0] same as bound)
- Note that audit access log exists

### Devnet validation checklist (pre-demo)
- [ ] Bearer invoice created → opened in incognito → claimed into a
  random third wallet → Cloak withdraw lands at third wallet.
- [ ] Bound invoice still works end-to-end (regression).
- [ ] Audit link → 3 views from 3 different IPs → access log shows 3
  entries → CSV export downloads with valid signature.
- [ ] Recurring payment → "Run now" → proposal in queue → execute →
  `lastRunAt` and `nextDueAt` bump correctly.

### Risks
- **Bearer link UX risk.** A leaked URL = lost funds. Mitigation: short
  default expiry (24h), red warning, no automatic clipboard prefill.
- **Audit signing key rotation.** No rotation story yet. v2 should add
  per-vault keys and let admins rotate.
- **Recurring without cron is a sharp edge.** If the user expects
  payments to fire automatically, the "Run" button is a footgun. UI
  copy must be explicit: *"Aegis tracks the schedule, you click Run."*

---
