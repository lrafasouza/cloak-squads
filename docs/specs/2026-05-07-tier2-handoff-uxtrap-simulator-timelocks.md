# Tier 2 Handoff — UX Trap Fix + Proposal Simulator + Time Locks

**Date:** 2026-05-07
**Audience:** an AI agent or developer picking up this work cold
**Status:** specced, not started
**Order:** 1) UX trap fix (1h) → 2) Proposal simulator (2-3h) → 3) Time locks (3-4h)

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

## 2. Proposal Simulator (~2-3h)

### Problem

Today a multisig signer approves proposals "blind". They see amount,
recipient, memo — but no preview of what the on-chain transaction will
actually do. This breaks down for:

- Misconstructed proposals (wrong recipient ATA, missing rent, etc.) — fails
  at execute, gas wasted, user confused
- Maliciously edited proposals (server compromise) — signer has no way to
  verify intent
- Complex multi-instruction proposals (Cloak deposit + license + vault
  transfer) — signer can't confirm each leg matches expectations

Squads.so has this. Not having it makes signers nervous.

### Fix

Add a "Simulate" button to `apps/web/app/vault/[multisig]/proposals/[id]/page.tsx`
that runs `connection.simulateTransaction()` against the reconstructed
proposal and renders a structured panel showing balance deltas per account,
the instruction trace, and any errors.

### Files to touch

- New: `apps/web/lib/proposal-simulator.ts`
- New: `apps/web/components/proposal/SimulatePanel.tsx`
- Modify: `apps/web/app/vault/[multisig]/proposals/[id]/page.tsx` — add button + panel
- Optionally new: `tests/unit/proposal-simulator.test.ts` (mock connection)

### Implementation

#### `lib/proposal-simulator.ts`

```ts
import { Connection, PublicKey, type SimulatedTransactionResponse } from "@solana/web3.js";
import * as multisigSdk from "@sqds/multisig";

export type BalanceDelta = {
  address: string;
  preBalance: number;
  postBalance: number;
  delta: number;
};

export type SimulationResult = {
  ok: boolean;
  err: string | null;
  logs: string[];
  balanceDeltas: BalanceDelta[];
  computeUnits: number | null;
  unitsConsumedFraction: number; // 0..1 of compute budget
};

/**
 * Simulate a Squads proposal's vaultTransactionExecute against an RPC node.
 *
 * Uses `replaceRecentBlockhash: true` so the call works without a fresh
 * blockhash from the proposer. `sigVerify: false` skips signature checks
 * (the proposal hasn't actually been signed yet by the executor — we just
 * want to see the on-chain effect).
 *
 * The accounts list is built from the inner instructions of the vault
 * transaction, so the response includes preBalance/postBalance for every
 * account that the proposal touches. Balance deltas are computed from there.
 */
export async function simulateProposal({
  connection,
  multisig,
  transactionIndex,
  proposer,
}: {
  connection: Connection;
  multisig: PublicKey;
  transactionIndex: bigint;
  proposer: PublicKey; // wallet that would execute (any member works for simulation)
}): Promise<SimulationResult> {
  // Build the on-chain execute transaction. The Squads SDK exposes a helper
  // that returns the unsigned transaction — we feed that to simulate.
  const tx = await multisigSdk.transactions.vaultTransactionExecute({
    connection,
    multisigPda: multisig,
    transactionIndex,
    member: proposer,
    blockhash: (await connection.getLatestBlockhash()).blockhash,
    feePayer: proposer,
  });

  // Collect every account referenced by any instruction so simulate returns
  // their pre/post balances.
  const accountsTouched = new Set<string>();
  for (const ix of tx.message.compiledInstructions ?? []) {
    for (const idx of ix.accountKeyIndexes) {
      const key = tx.message.staticAccountKeys[idx];
      if (key) accountsTouched.add(key.toBase58());
    }
  }

  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: {
      encoding: "base64",
      addresses: [...accountsTouched],
    },
  });

  return shapeSimulation(sim.value, [...accountsTouched]);
}

function shapeSimulation(
  raw: SimulatedTransactionResponse,
  addresses: string[],
): SimulationResult {
  const logs = raw.logs ?? [];
  const err = raw.err ? JSON.stringify(raw.err) : null;
  const ok = err === null;

  const balanceDeltas: BalanceDelta[] = [];
  if (raw.accounts) {
    raw.accounts.forEach((acc, i) => {
      const address = addresses[i];
      if (!address || !acc) return;
      const post = acc.lamports;
      // Pre-balance must come from a separate getMultipleAccounts call;
      // simulateTransaction returns POST only. To compute deltas we'd need
      // pre-state. For now we approximate via logs ("Program N consumed X"),
      // OR fetch pre-balances upfront (cleanest). Keeping simple: fetch pre
      // before sim, store, subtract.
      // (See full impl in `simulateProposalWithDeltas`.)
      balanceDeltas.push({ address, preBalance: 0, postBalance: post, delta: post });
    });
  }

  const computeUnits = raw.unitsConsumed ?? null;
  const unitsConsumedFraction = computeUnits ? Math.min(1, computeUnits / 1_400_000) : 0;

  return { ok, err, logs, balanceDeltas, computeUnits, unitsConsumedFraction };
}
```

> NOTE: The deltas calculation needs a `getMultipleAccountsInfo` call BEFORE
> simulate to capture pre-balances. The skeleton above leaves a TODO; flesh it
> out by:
> 1. Fetch pre-balances: `await connection.getMultipleAccountsInfo(addresses.map(a => new PublicKey(a)))`
> 2. Run `simulateTransaction`
> 3. Compute `delta = postBalance - preBalance` for each address

#### `SimulatePanel.tsx`

```tsx
"use client";

import { Panel, PanelBody, PanelHeader, StatusPill } from "@/components/ui/workspace";
import { lamportsToSol } from "@/lib/sol";
import type { SimulationResult } from "@/lib/proposal-simulator";
import { ArrowDownRight, ArrowUpRight, AlertTriangle, CheckCircle2 } from "lucide-react";

export function SimulatePanel({ result }: { result: SimulationResult }) {
  return (
    <Panel>
      <PanelHeader
        icon={result.ok ? CheckCircle2 : AlertTriangle}
        title={result.ok ? "Simulation passed" : "Simulation failed"}
        action={
          <StatusPill tone={result.ok ? "success" : "danger"}>
            {result.ok ? "OK" : "Error"}
          </StatusPill>
        }
      />
      <PanelBody className="space-y-4">
        {result.err && (
          <div className="rounded-md border border-signal-danger/30 bg-signal-danger/5 p-3 font-mono text-xs text-signal-danger">
            {result.err}
          </div>
        )}

        {/* Balance deltas */}
        {result.balanceDeltas.length > 0 && (
          <div>
            <p className="text-eyebrow text-ink-subtle mb-2">Balance changes</p>
            <ul className="space-y-1.5">
              {result.balanceDeltas
                .filter((d) => d.delta !== 0)
                .map((d) => (
                  <li key={d.address} className="flex items-center justify-between rounded-md bg-surface-2/50 px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-ink-muted">
                      {d.address.slice(0, 8)}…{d.address.slice(-6)}
                    </span>
                    <span className={`flex items-center gap-1 font-mono ${d.delta > 0 ? "text-signal-positive" : "text-signal-danger"}`}>
                      {d.delta > 0 ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {d.delta > 0 ? "+" : ""}
                      {lamportsToSol(Math.abs(d.delta))} SOL
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Compute units */}
        {result.computeUnits !== null && (
          <div className="text-xs text-ink-subtle">
            Compute units consumed: {result.computeUnits.toLocaleString()} / 1,400,000
            ({(result.unitsConsumedFraction * 100).toFixed(1)}%)
          </div>
        )}

        {/* Logs (collapsible, default closed) */}
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">
            Instruction logs ({result.logs.length})
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-bg/50 p-3 font-mono text-[10px] text-ink-subtle">
            {result.logs.join("\n")}
          </pre>
        </details>
      </PanelBody>
    </Panel>
  );
}
```

#### Integrate in proposal detail page

In `apps/web/app/vault/[multisig]/proposals/[id]/page.tsx`:

1. Add a `<Button variant="outline">Simulate</Button>` next to existing
   Sign / Execute buttons
2. State: `const [simResult, setSimResult] = useState<SimulationResult | null>(null);` and `loading`
3. Handler: `await simulateProposal({ connection, multisig: multisigPk, transactionIndex: BigInt(transactionIndex), proposer: wallet.publicKey })`
4. Render `<SimulatePanel result={simResult} />` below the proposal details

### Edge cases

- **Proposal already executed** — disable Simulate button (compare
  `proposal.status === "executed"`), show tooltip "Already executed"
- **Stale blockhash** — `replaceRecentBlockhash: true` handles this
- **RPC timeout** — wrap in try/catch, surface "Simulation timed out — try again"
- **Cloak deposit not visible in sim** — the simulator only sees the Squads
  vault transaction (vault → operator transfer + license issue). The
  subsequent Cloak deposit by the operator wallet is a SEPARATE tx and isn't
  part of this simulation. Document this in the SimulatePanel description:
  "Shows the on-chain effect of the multisig execution. Operator-side Cloak
  deposit runs as a separate transaction."
- **Compute unit limit** — if `unitsConsumed > 1,400,000` simulation throws;
  unlikely for our flows (we're well under 200k for any single proposal)

### Tests

Mock-based unit test in `tests/unit/proposal-simulator.test.ts`:
- Stub a `Connection` whose `simulateTransaction` returns a known shape
- Verify `shapeSimulation` returns expected deltas, ok flag, error mapping

Manual devnet:
1. Open an unexecuted proposal → click Simulate → see balance deltas
2. Make a proposal with intentionally wrong recipient → Simulate → "Error" pill + JSON err
3. Confirm the panel renders both successful and failed simulations

### Risk: Low
RPC `simulateTransaction` is read-only — no chain mutation, no DB writes.
Only failure modes are RPC unavailability (catch) or stale blockhash
(handled by `replaceRecentBlockhash`).

### Effort breakdown

| Step | Time |
|---|---|
| `simulateProposal` helper with pre/post deltas | 1h |
| `SimulatePanel` component | 45min |
| Integrate into proposal detail page (button + state + render) | 30min |
| Edge cases + cache result for 60s | 30min |
| Manual devnet validation across proposal types (transfer, payroll, config) | 30min |

---

## 3. Time Locks (~3-4h)

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

### After all 3 ship

Update memory:
- Add a memory entry for "Tier 2 batch 1: UX trap fix + simulator + time
  locks" pointing at the relevant commits and this spec
- If anything surprising came up, capture as a feedback memory

Update README:
- Add Time Locks to the feature table under Governance
- Add Proposal Simulator to the feature table

### Useful repo files to read first

- `apps/web/components/app/VaultDashboard.tsx` — how the dashboard composes
- `apps/web/components/vault/OverviewCard.tsx` — where the chip slots in
- `apps/web/components/vault/ReceiveModal.tsx` — reference for how vault PDA
  is currently shown
- `apps/web/lib/squads-sdk.ts` — SDK helper patterns to copy
- `apps/web/lib/use-vault-data.ts` — multisig account read pattern
- `apps/web/app/vault/[multisig]/proposals/[id]/page.tsx` — proposal detail
  page where Simulate button goes
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
2. Simulator (2-3h, ROI on every proposal flow)
3. Time locks (3-4h, capstone institutional feature)

Total: ~6-9h. Each ships as its own commit. After all three, run a final
typecheck + biome pass + vitest, then push.
