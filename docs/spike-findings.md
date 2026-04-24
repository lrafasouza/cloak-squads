# Spike Findings

## 2026-04-24 Phase 0 Status

### Toolchain

- Node is available in the workspace (`v24.12.0`).
- `pnpm` is available through Corepack with `pnpm@9.12.0`.
- Anchor/Rust are not available in this shell: `anchor`, `rustc`, and `cargo` are missing.

### Completed

- Root pnpm/Turborepo scaffold is in place.
- `cloak-gatekeeper` Anchor program skeleton is in place.
- `cloak-mock` Anchor program skeleton is in place.
- Minimal `issue_license` and `execute_with_license` source files are in place for the CPI spike.
- Test dependencies are installed and pinned to Anchor client `@coral-xyz/anchor@0.30.1`.
- Squads SDK is installed and pinned by lockfile at `@sqds/multisig@2.1.4`.
- `scripts/spike-squads-devnet.ts` contains executable Squads v4 SDK calls for
  `multisigCreateV2`, `vaultTransactionCreate`, `proposalCreate`, `proposalApprove`,
  and `vaultTransactionExecute`.
- `issue_license` and `init_cofre` now require the Squads v4 vault PDA at index 0 to sign.
- `execute_with_license` is intentionally locked to `cloak-mock` for Phase 0. A later production
  task must replace that hard-coded mock target with the real configured Cloak program path.

### Open Risk

The actual gatekeeper -> cloak-mock CPI has not been executed yet because generated Anchor IDLs
and `.so` artifacts require a local Anchor/Rust toolchain. Do not mark the Phase 0 CPI-depth
checkpoint complete until `pnpm anchor:build` succeeds and
`pnpm vitest run tests/integration/spike-cpi.test.ts` is replaced with a real issue+execute
bankrun test.

The Squads devnet spike is blocked on test SOL availability in the default public faucet. The script
falls back to an ephemeral keypair when `SOLANA_KEYPAIR` is not set, but devnet returned:
`429 Too Many Requests` and `airdrop faucet has run dry`. Re-run with a funded devnet keypair:

```bash
SOLANA_KEYPAIR=/path/to/devnet-funded-keypair.json pnpm tsx scripts/spike-squads-devnet.ts
```

### Next Verification Commands

```bash
pnpm anchor:build
pnpm vitest run tests/integration/spike-cpi.test.ts
pnpm tsx scripts/spike-squads-devnet.ts
```
