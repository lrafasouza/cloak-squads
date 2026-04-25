# Cloak Squads Demo Runbook

## F1 Private Send

Goal: show a Squads vault approving a private execution license, then the operator executing the Cloak transfer through the gatekeeper.

Prerequisites:
- Devnet wallet funded with SOL.
- A Squads v4 multisig initialized on devnet with at least two signer wallets.
- `cloak-gatekeeper` and `cloak-mock` deployed with the program IDs in `apps/web/.env.local`.
- Prisma migration applied for the web app.

User-run commands:

```bash
pnpm prebuild:web
pnpm -F web dev
```

Flow:

1. Open the web app and connect signer wallet A.
2. Paste the Squads multisig PDA in the cofre picker.
3. Open `Prepare send`.
4. Enter a lamport amount, recipient stealth public key, and optional memo.
5. Click `Create proposal`.
6. Switch to signer wallet B and open `/cofre/<multisig>/proposals/<transactionIndex>`.
7. Confirm the commitment check is green.
8. Click `Approve`.
9. Switch back to the operator wallet after Squads threshold is reached.
10. Execute the Squads vault transaction so the license is issued.
11. Run the operator execution path with fresh Cloak Merkle data and confirm the license is consumed.

Expected capture:
- Proposal creation signature.
- Approval transaction signature.
- Gatekeeper `LicenseIssued` event.
- Gatekeeper `LicenseConsumed` event.
- Explorer view showing the public transaction does not reveal the private recipient or amount beyond the approved payload commitment.

## Phase 2 Preview

F2 payroll, F3 audit admin, and F3.5 public audit link will extend this runbook after the F1 path is stable on devnet.
