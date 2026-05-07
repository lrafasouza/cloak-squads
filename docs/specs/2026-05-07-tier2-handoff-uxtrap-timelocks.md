# Tier 2 Handoff — UX Trap Fix + Time Locks

**Date:** 2026-05-07
**Audience:** an AI agent or developer picking up this work cold
**Status:** specced, not started
**Order:** 1) UX trap fix (1h) → 2) Time locks (3-4h)

---

## 0. Project context (read first)

**Aegis** is a privacy-first multisig treasury app on Solana, built on Squads
Protocol v4 plus the Cloak shield pool. Users create a multisig vault, vote on
payments through the standard Squads threshold flow, and Aegis routes the
execution either publicly (`SystemProgram.transfer`) or privately (via Cloak
ZK shield pool through a registered operator wallet).

**Repo:** `/Users/rafazaum/Desktop/cloak-squads`
**Web app:** `apps/web` (Next.js 15 App Router, TypeScript strict, Tailwind,
Prisma + PostgreSQL, TanStack Query, Squads SDK `@sqds/multisig` v2.1.4)
**Live demo:** [aegisz.xyz](https://aegisz.xyz) (devnet, Helius RPC)
**Cluster lib:** `apps/web/lib/cluster.ts` — `getCurrentCluster()` reads
`NEXT_PUBLIC_SOLANA_CLUSTER` env (devnet/mainnet-beta/testnet/localnet)

### Key architectural concepts

1. **Multisig PDA** — the Squads multisig account itself. It's the canonical
   identifier in URLs (`/vault/[multisig]`). Program-owned (Squads), holds
   metadata. **Cannot receive payable SOL — funds sent here are stuck.**
2. **Vault PDA** — `squadsVaultPda(multisig, programId, vaultIndex)`. This is
   where SOL actually lives and what proposals spend from. `vaultIndex=0` is
   the primary vault, `vaultIndex>0` are sub-vaults.
3. **Operator wallet** — a regular Ed25519 wallet registered in the Aegis
   gatekeeper. Receives the SOL atomically when a private proposal executes,
   then deposits into Cloak.
4. **Cloak gatekeeper program** — custom Anchor program that issues
   single-use, time-bounded "licenses" tied to a payload hash. Operator
   consumes the license to execute the shielded transfer.

### Conventions

- Biome for lint/format (`pnpm -w biome check ...`)
- TypeScript strict mode + `exactOptionalPropertyTypes: true`
- No emojis in code or text unless user asks
- Comments only when WHY is non-obvious; don't explain WHAT
- Prisma migrations are append-only; never edit a deployed migration
- Tests live in `tests/unit/`, run with `pnpm vitest run --config tests/unit/vitest.config.ts`
- Sensitive data (UTXO keys, etc.) encrypted at rest via `lib/field-crypto.ts`
- Auth via session cookie (`requireWalletAuth` / `requireVaultMember` /
  `requireVaultOperator`)

### Current state (May 2026)

Recently shipped (committed on master):
- Dashboard KPI strip (Inflow / Outflow / Privacy share) — `components/vault/TreasuryFlowStrip.tsx`
- DB-backed income indexer with WebSocket realtime sync — `lib/vault-income-sync.ts`, `lib/hooks/useVaultIncome.ts`
- Bearer invoices, recurring payments scaffold, signed audit exports
- Governance + Cloak block split into 2-col compact layout

What's NOT done yet (relevant for this spec):
- The dashboard header and balance card don't disambiguate the multisig
  identifier from the vault PDA (deposit destination). Users have sent SOL
  to the wrong address and lost funds.
- No way to preview the on-chain effect of a proposal before approving.
- Time locks are supported on-chain by Squads v4 but Aegis has no UI for them.

---

## 1. UX Trap Fix — disambiguate deposit address (~1h)

### Problem

Two distinct addresses look interchangeable in the dashboard:

| Address | Where it appears | What it does |
|---|---|---|
| **Multisig PDA** | URL (`/vault/[multisig]`), header `<DashboardVaultIdentity>`, header copy button | Squads program-owned account holding multisig state. NOT a payable destination. |
| **Vault PDA** | `<ReceiveModal>` only | Squads vault PDA derived from multisig + index. Holds spendable SOL. |

The header in `apps/web/components/app/VaultDashboard.tsx` shows the multisig
PDA as a copyable chip with no warning. Users copy that and send SOL to
it — funds get stuck because no Squads instruction transfers out of the
multisig account, only out of vault PDAs.

### Fix

Add a prominent "Deposit address" chip directly inside `OverviewCard`,
showing the **vault PDA for the currently selected sub-vault** with a copy
button and a QR. The header keeps the multisig PDA but the copy button gets
a tooltip clarifying it's a governance identifier, not a deposit destination.

### Files to touch

- `apps/web/components/vault/OverviewCard.tsx` — add `<DepositAddressChip>` below the balance + actions row
- `apps/web/components/app/VaultDashboard.tsx` — pass selected `vaultIndex` to OverviewCard if it isn't already; tooltip on the existing header copy
- New: `apps/web/components/vault/DepositAddressChip.tsx`

### Implementation

#### `DepositAddressChip.tsx`

```tsx
"use client";

import { publicEnv } from "@/lib/env";
import { squadsVaultPda } from "@cloak-squads/core/pda";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export function DepositAddressChip({
  multisig,
  vaultIndex = 0,
  vaultName,
}: {
  multisig: string;
  vaultIndex?: number;
  vaultName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const vaultAddress = useMemo(() => {
    try {
      const [pda] = squadsVaultPda(
        new PublicKey(multisig),
        new PublicKey(publicEnv.NEXT_PUBLIC_SQUADS_PROGRAM_ID),
        vaultIndex,
      );
      return pda.toBase58();
    } catch {
      return null;
    }
  }, [multisig, vaultIndex]);

  useEffect(() => {
    if (!qrOpen || !vaultAddress) return;
    void QRCode.toDataURL(vaultAddress, { width: 220, margin: 2 }).then(setQrUrl);
  }, [qrOpen, vaultAddress]);

  if (!vaultAddress) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(vaultAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const truncated = `${vaultAddress.slice(0, 6)}…${vaultAddress.slice(-6)}`;

  return (
    <div className="rounded-xl border border-border/60 bg-surface-2/40 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-eyebrow text-ink-subtle">
            Deposit address{vaultName && vaultName !== "Primary" ? ` · ${vaultName}` : ""}
          </p>
          <p className="mt-1 truncate font-mono text-sm text-ink">{truncated}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
            aria-label="Copy deposit address"
            title={copied ? "Copied" : vaultAddress}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
            aria-label="Show QR code"
          >
            <QrCode className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-subtle">
        Send SOL here. The vault identifier in the header is for governance only;
        SOL sent to it is unrecoverable.
      </p>
      {qrOpen && qrUrl && (
        <div className="mt-3 flex justify-center">
          <img src={qrUrl} alt="Deposit QR" className="h-[220px] w-[220px] rounded-md border border-border bg-white p-2" />
        </div>
      )}
    </div>
  );
}
```

#### Wire into `OverviewCard.tsx`

Find the section right after the action buttons (Send / Receive / Swap) and
insert the chip. The OverviewCard already receives `multisig` and
`subVaultBreakdown`. Determine the current `vaultIndex` (0 if no sub-vault
selected, otherwise the selected one).

```tsx
import { DepositAddressChip } from "./DepositAddressChip";

// inside JSX, below the action buttons:
<DepositAddressChip
  multisig={multisig}
  vaultIndex={selectedVaultIndex ?? 0}
  vaultName={selectedVaultName}
/>
```

If OverviewCard doesn't currently track which sub-vault is "selected", just
default to `0` (Primary). The Receive modal handles per-sub-vault selection
already.

#### Tooltip on header copy

`VaultDashboard.tsx` `<DashboardVaultIdentity>`. Wrap the existing copy button
in a `<Tooltip>` (Radix) with content:

> Multisig identifier (governance ID). For deposits, use the address shown
> below the balance.

Reuse `Tooltip`/`TooltipContent`/`TooltipTrigger` from `components/ui/tooltip`.
The dashboard already has TooltipProvider wrapping children via AppShell, so
no new provider needed.

### Edge cases

- **Sub-vault selected** — chip's `vaultIndex` updates, address re-derives.
  When reverting to Primary, vaultIndex returns to 0
- **Cofre not initialized** — chip can still render (vault PDA is derivable
  before Cloak init); the address is valid, just no shielded routing yet
- **Mobile** — keep the chip layout responsive; the QR section can stack
  vertically below the address row
- **Header truncation** — already truncates to `XX...XX`; tooltip shows full
  multisig only

### Tests

Manual devnet:
1. Open a vault → confirm chip shows vault PDA (different from URL multisig)
2. Copy the chip address → paste into a Phantom Send → fund flows in 5s
3. Header copy still works → tooltip shows up on hover

No new unit tests required (component is presentational).

### Risk: Zero
No on-chain change, no data flow change, purely UI surface addition.

### Effort breakdown

| Step | Time |
|---|---|
| `DepositAddressChip.tsx` component | 30min |
| Integrate in OverviewCard with sub-vault binding | 20min |
| Tooltip on header copy | 10min |
| Mobile responsive + dark-mode polish | 10-20min |

---

## 2. Time Locks (~3-4h)

### Problem

Squads v4 supports a `time_lock` field on the multisig config that delays
`proposal_execute` until N seconds after approval. Aegis has no UI to set or
display this — institutional users who want a 24h cooling period after
approval can't enable it without going through the SDK directly.

### Fix

Three-part implementation:

1. SDK helper to create the config proposal that sets `time_lock`
2. Settings UI to read current value and submit a change proposal
3. Proposals queue UI showing "Locked until …" countdown and disabling
   Execute until the lock expires

### Files to touch

- Modify: `apps/web/lib/squads-sdk.ts` — add `createSetTimeLockProposal`
- Modify: `apps/web/lib/use-vault-data.ts` — expose `timeLock` from the
  multisig account
- Modify: `apps/web/app/vault/[multisig]/settings/page.tsx` — add Security
  section with the slider/input + apply button
- Modify: `apps/web/app/vault/[multisig]/proposals/[id]/page.tsx` and the
  proposals queue list — show countdown and gate Execute button
- Optionally new: `apps/web/components/ui/countdown.tsx` for the live timer

### Implementation

#### SDK helper in `lib/squads-sdk.ts`

Pattern matches the existing `createChangeThresholdProposal`. The Squads
SDK exposes `multisigSdk.instructions.configTransactionCreate` which takes
a `ConfigAction`. The action type for time lock is `setTimeLock`:

```ts
import * as multisigSdk from "@sqds/multisig";
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

export async function createSetTimeLockProposal({
  connection,
  wallet,
  multisigPda,
  timeLockSeconds,
  memo,
}: {
  connection: Connection;
  wallet: { publicKey: PublicKey; signTransaction: <T extends VersionedTransaction>(t: T) => Promise<T> };
  multisigPda: PublicKey;
  timeLockSeconds: number; // 0 to disable, max ~604800 (7d)
  memo?: string;
}) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected.");
  }
  if (timeLockSeconds < 0 || timeLockSeconds > 604_800) {
    throw new Error("timeLock must be 0..604800 seconds.");
  }

  const multisigInfo = await multisigSdk.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = multisigInfo.transactionIndex + 1n;

  const ix = multisigSdk.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
    actions: [{ __kind: "SetTimeLock", newTimeLock: timeLockSeconds }],
    memo: memo ?? `set time_lock=${timeLockSeconds}s`,
    rentPayer: wallet.publicKey,
  });

  // Wrap in a versioned tx, sign, send. Pattern is identical to
  // createChangeThresholdProposal — copy from there.
  const proposalIx = multisigSdk.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix, proposalIx],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return { signature, transactionIndex };
}
```

#### Expose `timeLock` in `useVaultData`

The hook reads the multisig account on-chain. Add `timeLock` to the returned
object:

```ts
return {
  // ... existing fields
  timeLock: multisigInfo.timeLock, // u32 seconds
};
```

Update `VaultData` type accordingly.

#### Settings UI

In `apps/web/app/vault/[multisig]/settings/page.tsx`, add a new section:

```tsx
<Panel>
  <PanelHeader icon={Lock} title="Security" />
  <PanelBody className="space-y-4">
    <div>
      <Label htmlFor="timelock">Time lock</Label>
      <p className="text-xs text-ink-subtle">
        Required wait between proposal approval and execution. Gives members
        a window to spot and cancel a compromised approval.
      </p>
      <input
        id="timelock"
        type="range"
        min={0}
        max={168}
        step={1}
        value={hoursDraft}
        onChange={(e) => setHoursDraft(Number(e.target.value))}
        className="mt-2 w-full"
      />
      <p className="mt-1 text-sm font-mono text-ink">
        {hoursDraft === 0 ? "Disabled" : `${hoursDraft} hour${hoursDraft === 1 ? "" : "s"}`}
        {" · current: "}
        {currentTimeLockSeconds === 0
          ? "Disabled"
          : `${Math.round(currentTimeLockSeconds / 3600)}h`}
      </p>
      <Button
        onClick={handleApply}
        disabled={hoursDraft * 3600 === currentTimeLockSeconds}
        className="mt-3"
      >
        Apply (creates a proposal)
      </Button>
    </div>
  </PanelBody>
</Panel>
```

The handler creates the change proposal via the SDK and shows a confirmation
that the change requires multisig approval to take effect.

#### Proposals queue / detail UI

The proposal status today is one of `draft / active / approved / executing /
executed / rejected / cancelled`. Time-locked proposals are still `approved`
on-chain — the program just rejects `proposalExecute` until the lock
expires.

Add to the proposal summary:
1. `unlocksAt: number | null` — `proposal.approvedAtSlot * slotMs +
   timeLockSeconds * 1000` (approximate via slot rate, or use
   `getBlockTime(approvedAtSlot)` for accuracy)
2. UI:
   - Status pill becomes "Locked" when `unlocksAt > Date.now()`
   - Show countdown next to the pill: `"Unlocks in 14:32:05"` (live timer
     ticking every second)
   - Execute button `disabled={isLocked}` with tooltip "Wait Xh until time
     lock expires"

Component: `<Countdown to={unlocksAt} />` that calls `setInterval` 1s and
formats `formatDistanceToNowStrict()` from `date-fns` (already in deps) or a
simple custom formatter.

### Edge cases

- **Browser clock skew** — countdown uses `Date.now()` locally. If user has
  clock 5 min ahead, they see "Unlocks in 0s" but execute still fails. To
  mitigate, take the slot timestamp from `getBlockTime` once at mount, then
  derive locally. Or trust local clock for display and let the on-chain
  rejection be the source of truth for actual gating
- **Time lock removed mid-pending** — verify Squads behavior: does setting
  timeLock=0 unlock existing pending proposals? Test on devnet. If yes,
  document. If no (pending keep their original lock), document
- **Negative remaining time** — once `unlocksAt < Date.now()`, status pill
  flips to "Approved" (executable), Execute button enables
- **Sub-vault proposals** — the timeLock is per-multisig, applies to all
  proposals regardless of sourceVaultIndex
- **Multisig with timeLock > 604800** — guard upfront in the input and SDK
  helper
- **`approvedAtSlot` not stored on-chain** — Squads stores `proposal.status =
  Approved { timestamp }` where timestamp is unix seconds. Use that. Verify
  the field name in the IDL

### Tests

Manual devnet:
1. Set timeLock to 60 seconds via Settings
2. Wait for the config proposal to approve and execute
3. Create a regular send proposal → approve it → confirm "Locked" status
   with 60s countdown
4. Try Execute before 60s → button disabled. Try after 60s → succeeds
5. Set timeLock back to 0 → confirm new proposals don't lock

No specific unit test required (logic is driven by on-chain state + a small
date math function which can be tested in isolation if desired).

### Risk: Zero on-chain
Squads v4 already implements time locks. This is purely client-side
consumption. No new program, no new account, no migration.

### Effort breakdown

| Step | Time |
|---|---|
| `createSetTimeLockProposal` SDK helper (clone of changeThreshold pattern) | 30min |
| Expose `timeLock` in `useVaultData` | 15min |
| Settings UI (slider + apply + read current) | 1h |
| Countdown component + status pill changes | 1h |
| Execute button gating + tooltip | 30min |
| Manual devnet validation | 30-45min |

---

## Cross-cutting

### After both ship

Update memory:
- Add a memory entry for "Tier 2 batch 1: UX trap fix + time locks"
  pointing at the relevant commits and this spec
- If anything surprising came up, capture as a feedback memory

Update README:
- Add Time Locks to the feature table under Governance

### Useful repo files to read first

- `apps/web/components/app/VaultDashboard.tsx` — how the dashboard composes
- `apps/web/components/vault/OverviewCard.tsx` — where the chip slots in
- `apps/web/components/vault/ReceiveModal.tsx` — reference for how vault PDA
  is currently shown
- `apps/web/lib/squads-sdk.ts` — SDK helper patterns to copy
- `apps/web/lib/use-vault-data.ts` — multisig account read pattern
- `apps/web/app/vault/[multisig]/settings/page.tsx` — where Security section
  goes
- `apps/web/app/vault/[multisig]/recurring/page.tsx` — recent example of a
  full feature (good reference for component patterns)
- `apps/web/components/ui/workspace.tsx` — `<Panel>`, `<PanelHeader>`,
  `<StatusPill>` etc. used everywhere
- `apps/web/components/ui/tooltip.tsx` — Radix wrapper

### Commands cheat-sheet

```bash
# From repo root
cd /Users/rafazaum/Desktop/cloak-squads

# Web typecheck (must run from apps/web for path resolution)
cd apps/web && pnpm tsc --noEmit

# Biome (workspace-aware)
pnpm -w biome check apps/web/path/to/file --write

# Vitest unit tests
pnpm vitest run --config tests/unit/vitest.config.ts

# Dev server with env loaded
cd apps/web && set -a && . ./.env.local && set +a && pnpm dev

# Apply prisma migrations locally
cd apps/web && set -a && . ./.env.local && set +a && pnpm prisma migrate deploy
```

### Commit style

Match existing repo conventions:
- `feat(scope): subject` for features
- `fix(scope): subject` for fixes
- `chore(scope): subject` for non-feature work (logs, format)
- Body: 1-3 paragraphs explaining WHY and HOW, in that order
- Never claim work you didn't do
- Co-Authored-By trailer with `Claude Opus 4.7 <noreply@anthropic.com>`
  when AI-assisted

---

## Recommended order

1. UX trap fix first (1h, defensive, prevents fund loss while other features ship)
2. Time locks (3-4h, capstone institutional feature)

Total: ~4-5h. Each ships as its own commit. After both, run a final
typecheck + biome pass + vitest, then push.
