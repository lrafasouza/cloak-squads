# API Contracts (GETs públicos consumidos pelo React Query)

> Stable response shapes for all public GET endpoints.
> Frontend: copy these types into `lib/types.ts` and use them to type React Query hooks.

---

## GET /api/proposals/[multisig]/init-status

Returns whether the multisig has any pending (non-final) on-chain proposals. Used by frontend to disable the "Initialize Vault" button when a pending init already exists (TICKET #20, Melhorias §1.1).

```ts
type InitStatusResponse = {
  hasPendingInit: boolean;            // true if any proposal is Draft/Active/Approved/Executing
  pendingTxIndex: string | null;      // bigint as string, index of first pending proposal
  pendingProposalPda: string | null;  // base58 PDA of the pending Proposal account
  onChainTransactionIndex: string;    // current on-chain transactionIndex (bigint as string)
  onChainStaleTransactionIndex: string; // on-chain staleTransactionIndex (bigint as string)
  dbDraftCount: number;               // count of unarchived ProposalDraft rows in DB
};
```

**Error responses:**
- `400` — `{ error: "Invalid multisig address." }`
- `502` — `{ error: "Could not read multisig on-chain." }` (RPC failure)

**Frontend usage:**
```ts
const res = await fetch(`/api/proposals/${multisig}/init-status`);
const data: InitStatusResponse = await res.json();
if (data.hasPendingInit) {
  // disable "Initialize Vault" button, show "Pending proposal exists"
}
```

---

## GET /api/proposals/[multisig]

```ts
type Response = ProposalDraftDto[];
```

```ts
type ProposalDraftDto = {
  id: string;                          // UUID
  cofreAddress: string;                // base58 multisig address
  transactionIndex: string;            // bigint serialized as string
  amount: string;                      // lamports as string
  recipient: string;                   // base58 Solana address
  memo: string;                        // "" if null
  payloadHash: number[];               // 32-byte array
  invariants: {
    nullifier: number[];               // 32-byte array
    commitment: number[];              // 32-byte array
    amount: string;
    tokenMint: string;                 // base58
    recipientVkPub: number[];          // 32-byte array
    nonce: number[];                   // 16-byte array
  };
	  commitmentClaim?: {                  // only with ?includeSensitive=true + wallet auth
    amount: string | number;
    invoiceId?: string;
    r?: string;                        // hex 64-char (legacy)
    sk_spend?: string;                 // hex 64-char (legacy)
    keypairPrivateKey?: string;        // hex 64-char
    keypairPublicKey?: string;         // hex 64-char
    blinding?: string;                 // hex 64-char
    tokenMint?: string;                // base58
    commitment: string;                // hex 64-char
    recipient_vk: string;              // base58
    token_mint: string;                // base58
  };
  signature?: string;                  // undefined if null
  createdAt: string;                   // ISO 8601
  archivedAt: string | null;           // ISO 8601 or null (TICKET #13b)
};
```

**Query params:**
- `includeArchived=true` — include archived drafts (default: exclude `archivedAt !== null`)

---

## GET /api/proposals/[multisig]/[index]

Returns a single proposal draft.

```ts
type Response = ProposalDraftDto;  // same as above
```

By default this public GET omits `commitmentClaim`. Use `?includeSensitive=true` with wallet auth headers when the signer/operator flow needs private execution material.

**Error responses:**
- `400` — `{ error: "Invalid multisig address." }`
- `401` — auth missing/invalid when `includeSensitive=true`
- `404` — `{ error: "Proposal draft not found." }`
- `503` — `{ error: "Database unavailable." }`

---

## GET /api/payrolls/[multisig]

Returns payroll drafts for a multisig (summary, no recipients).

```ts
type Response = PayrollDraftSummaryDto[];
```

```ts
type PayrollDraftSummaryDto = {
  id: string;                          // UUID
  cofreAddress: string;                // base58
  transactionIndex: string;            // bigint serialized as string
  memo?: string;                       // undefined if null
  totalAmount: string;                 // lamports as string
  recipientCount: number;
  mode: string;                        // "direct" | "invoice"
  createdAt: string;                   // ISO 8601
};
```

---

## GET /api/payrolls/[multisig]/[index]

Returns a single payroll draft with full recipient details.

```ts
type Response = PayrollDraftDetailDto;
```

```ts
type PayrollDraftDetailDto = {
  id: string;
  cofreAddress: string;
  transactionIndex: string;
  memo?: string;
  totalAmount: string;
  recipientCount: number;
  mode: string;                        // "direct" | "invoice"
  recipients: PayrollRecipientDto[];
  createdAt: string;                   // ISO 8601
};

type PayrollRecipientDto = {
  id: string;
  name: string;
  wallet: string;                      // base58
  amount: string;                      // lamports as string
  memo?: string;
  payloadHash: number[];               // 32-byte array
  invariants: {                        // parsed JSON, same shape as ProposalDraftDto.invariants
    nullifier: number[];
    commitment: number[];
    amount: string;
    tokenMint: string;
    recipientVkPub: number[];
    nonce: number[];
  } | null;                            // null on parse failure
  commitmentClaim?: {                   // only with ?includeSensitive=true + wallet auth
    amount: string | number;
    invoiceId?: string;
    r?: string;
    sk_spend?: string;
    keypairPrivateKey?: string;
    keypairPublicKey?: string;
    blinding?: string;
    tokenMint?: string;
    commitment: string;
    recipient_vk: string;
    token_mint: string;
  };
  invoiceId?: string;                  // undefined if null
  signature?: string;                  // undefined if null
};
```

**Error responses:**
- `400` — `{ error: "Invalid multisig address." }`
- `401` — auth missing/invalid when `includeSensitive=true`
- `404` — `{ error: "Payroll draft not found." }`
- `503` — `{ error: "Database unavailable." }`

---

## GET /api/audit-links/[vault]

Returns audit links for a vault/cofre.

```ts
type Response = AuditLinkDto[];
```

```ts
type AuditLinkDto = {
  id: string;                          // UUID
  cofreAddress: string;                // base58
  scope: string;                       // "full" | "amounts_only" | "time_ranged"
  scopeParams: string | null;          // JSON string or null
  expiresAt: string;                   // ISO 8601
  issuedBy: string;                    // base58
  createdAt: string;                   // ISO 8601
};
```

---

## GET /api/audit/[linkId]

Returns a single audit link (public, shareable). Never exposes `diversifier` or `signature`.

```ts
type Response = AuditLinkPublicDto;
```

```ts
type AuditLinkPublicDto = {
  id: string;
  cofreAddress: string;
  scope: string;                       // "full" | "amounts_only" | "time_ranged"
  scopeParams: string | null;
  expiresAt: string;                   // ISO 8601
  issuedBy: string;
  createdAt: string;
};
```

**Error responses:**
- `404` — `{ error: "Audit link not found." }`
- `410` — `{ error: "Audit link expired." }`

---

## GET /api/stealth/[id]

Returns stealth invoices for a cofre address. The `id` param is actually a `cofreAddress`.

```ts
type Response = StealthInvoiceDto[];
```

```ts
type StealthInvoiceDto = {
  id: string;                          // UUID
  cofreAddress: string;
  recipientWallet: string;             // base58
  invoiceRef: string | null;
  memo: string | null;
  stealthPubkey: string;               // base58
  amountHint: string | null;           // decoded from encrypted bytes
  status: string;                      // "pending" | "claimed"
  expiresAt: string;                   // ISO 8601
  createdAt: string;                   // ISO 8601
  utxoAmount: string | null;
  utxoPublicKey: string | null;
  utxoBlinding: string | null;
  utxoMint: string | null;
  utxoLeafIndex: number | null;
  utxoCommitment: string | null;
};
```

> **Note:** `utxoPrivateKey` is intentionally excluded from GET responses.

---

## GET /api/circuits/[...path]

Proxy for ZK circuit artifacts. Returns binary content with appropriate `Content-Type`.

```ts
type Response = ArrayBuffer;  // binary (wasm, zkey, etc.)
```

Headers: `Content-Type`, `Cache-Control: public, max-age=86400, s-maxage=604800, immutable`

---

## GET /api/cloak-relay/[...path]

Proxy for Cloak relay API. Passes through upstream response.

```ts
type Response = unknown;  // depends on upstream Cloak relay endpoint
```

Headers: `Content-Type` (from upstream), `Cache-Control: no-store`

---

## Backward compatibility notes

- `archivedAt` (TICKET #13b) is added as `string | null` — nullable/optional, backward-compatible.
- `commitmentClaim` is omitted from public GET responses. Authenticated callers can request `?includeSensitive=true`.
- `memo` is `""` for proposals (serializeDraft converts null → ""), but `undefined` for payrolls.
