# Tech Debt Cleanup + Multi-Member UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 4 gaps técnicos do F1 (squads-adapter, rate limit, copy link, CLOAK_PROGRAM_ID configurável) como pré-requisito para F2 Payroll.

**Architecture:** 4 mudanças independentes executadas em ordem. Tasks 1–3 são TS/JS puros (sem redeploy). Task 4 é Rust — requer `anchor build` e redeploy devnet por último. Rate limit usa Map in-memory puro, sem dependências externas. Feature flag Rust usa `#[cfg(feature = "mainnet")]` nativo do Cargo.

**Tech Stack:** TypeScript, Next.js 15 App Router, `next/headers`, Rust/Anchor 0.31.1, `@sqds/multisig` v2.1.4, Prisma/SQLite

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/lib/rate-limit.ts` | Criar | Fixed Window Counter por IP, sem dependências |
| `apps/web/app/api/proposals/route.ts` | Modificar | Aplicar rate limit no início do POST handler |
| `packages/core/src/squads-adapter.ts` | Modificar | Adicionar `proposalCreate` após `vaultTransactionCreate`, retornar signature |
| `apps/web/app/cofre/[multisig]/proposals/[id]/page.tsx` | Modificar | Adicionar estado `copied`, handler e botão "Copy link" |
| `programs/cloak-gatekeeper/Cargo.toml` | Modificar | Adicionar `mainnet = []` ao `[features]` existente |
| `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs` | Modificar | Substituir constante hardcoded por par `#[cfg]` |

---

## Task 1: Rate limit helper

**Files:**
- Create: `apps/web/lib/rate-limit.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// apps/web/lib/rate-limit.ts
const map = new Map<string, { count: number; reset: number }>();

export function checkRateLimit(
  ip: string,
  limit = 10,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const existing = map.get(ip);

  if (!existing || now > existing.reset) {
    map.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;

  existing.count++;
  return true;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F web exec tsc --noEmit
```

Esperado: sem erros (o arquivo é TypeScript puro sem dependências).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/rate-limit.ts
git commit -m "feat(web): add in-memory rate limit helper (10 req/min per IP)"
```

---

## Task 2: Aplicar rate limit no POST /api/proposals

**Files:**
- Modify: `apps/web/app/api/proposals/route.ts`

O arquivo atual começa na linha 1 com imports do Prisma/zod e tem o `POST` handler na linha 28. Não há `GET` nesse arquivo — só o POST.

- [ ] **Step 1: Adicionar imports no topo do arquivo**

Após os imports existentes (linha 5, após `import { serializeDraft } ...`), inserir:

```typescript
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
```

- [ ] **Step 2: Adicionar verificação no início do POST handler**

A função `POST` começa na linha 28: `export async function POST(request: Request) {`. Inserir as 5 linhas de rate limit logo após a abertura da função, antes do bloco `try`:

```typescript
export async function POST(request: Request) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  // ... resto inalterado
```

- [ ] **Step 3: Typecheck**

```bash
pnpm -F web exec tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/proposals/route.ts
git commit -m "feat(web): rate limit POST /api/proposals — 10 req/min per IP"
```

---

## Task 3: Fix buildIssueLicenseProposal — adicionar proposalCreate

**Files:**
- Modify: `packages/core/src/squads-adapter.ts`

**Problema:** a função cria a `vaultTransactionCreate` mas não cria o `proposalCreate`. Scripts CLI que usam `createIssueLicenseProposalWithSigner` (em `apps/web/lib/squads-sdk.ts:43`) criariam a vault tx sem o proposal correspondente.

**Tipos confirmados do SDK `@sqds/multisig` v2.1.4:**
- `multisig.rpc.vaultTransactionCreate` → `creator: PublicKey` (não Signer)
- `multisig.rpc.proposalCreate` → `creator: Signer`, `feePayer: Signer`
- Ambos retornam `Promise<TransactionSignature>` (string)

- [ ] **Step 1: Substituir o conteúdo completo do arquivo**

```typescript
// packages/core/src/squads-adapter.ts
import {
  type Connection,
  type PublicKey,
  type Signer,
  type TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

export async function buildIssueLicenseProposal(params: {
  connection: Connection;
  multisigPda: PublicKey;
  creator: Signer;
  issueLicenseIx: TransactionInstruction;
}): Promise<{
  transactionIndex: bigint;
  vaultTransactionPda: PublicKey;
  signature: string;
}> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    params.connection,
    params.multisigPda,
  );
  const newTxIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  const [vaultPda] = multisig.getVaultPda({
    multisigPda: params.multisigPda,
    index: 0,
  });

  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await params.connection.getLatestBlockhash()).blockhash,
    instructions: [params.issueLicenseIx],
  });

  await multisig.rpc.vaultTransactionCreate({
    connection: params.connection,
    feePayer: params.creator,
    multisigPda: params.multisigPda,
    transactionIndex: newTxIndex,
    creator: params.creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: "issue license",
  });

  const signature = await multisig.rpc.proposalCreate({
    connection: params.connection,
    feePayer: params.creator,
    creator: params.creator,
    multisigPda: params.multisigPda,
    transactionIndex: newTxIndex,
  });

  const [vaultTransactionPda] = multisig.getTransactionPda({
    multisigPda: params.multisigPda,
    index: newTxIndex,
  });

  return { transactionIndex: newTxIndex, vaultTransactionPda, signature };
}
```

- [ ] **Step 2: Typecheck em todo o monorepo**

```bash
pnpm typecheck:all
```

Esperado: sem erros. O consumidor `createIssueLicenseProposalWithSigner` em `squads-sdk.ts:43` não usa `signature` — TypeScript não força usar o retorno de uma Promise.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/squads-adapter.ts
git commit -m "fix(core): add proposalCreate to buildIssueLicenseProposal, return signature"
```

---

## Task 4: Botão "Copy link" na página de proposta

**Files:**
- Modify: `apps/web/app/cofre/[multisig]/proposals/[id]/page.tsx`

O componente já tem vários `useState`. O JSX começa com um `<main>`. O header da proposta fica na coluna esquerda do grid (`<div>` dentro de `<section className="mx-auto grid...">`).

- [ ] **Step 1: Adicionar estado `copied`**

Na lista de useState existente (por volta da linha 60–68), adicionar:

```typescript
const [copied, setCopied] = useState(false);
```

- [ ] **Step 2: Adicionar handler copyProposalLink**

Após os handlers `onVoteSubmitted` e `onExecuteSubmitted` (por volta da linha 138–151), adicionar:

```typescript
function copyProposalLink() {
  void navigator.clipboard.writeText(window.location.href).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  });
}
```

- [ ] **Step 3: Adicionar bloco de compartilhamento no JSX**

Na coluna esquerda do grid, logo após o `<p>` com texto `"Review the decrypted transfer claim..."` (por volta da linha 173), inserir:

```tsx
<div className="mt-4 flex items-start gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
  <div className="min-w-0 flex-1">
    <p className="text-sm font-medium text-neutral-100">Share with other signers</p>
    <p className="mt-1 break-all font-mono text-xs text-neutral-400">
      {typeof window !== "undefined" ? window.location.href : ""}
    </p>
  </div>
  <button
    type="button"
    onClick={copyProposalLink}
    className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-100 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
  >
    {copied ? "Copied!" : "Copy link"}
  </button>
</div>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck:all
```

Esperado: sem erros.

- [ ] **Step 5: Testar no browser**

```bash
pnpm -F web dev
```

Navegar até `http://localhost:3000`, abrir uma proposta existente e verificar:
- Bloco "Share with other signers" aparece com a URL atual
- Clicar "Copy link" muda o texto para "Copied!" por ~2s e restaura
- Abrir a URL copiada em outra aba mostra o draft (amount, recipient) e o aviso âmbar do commitmentClaim

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/cofre/[multisig]/proposals/[id]/page.tsx
git commit -m "feat(web): add copy link button to proposal page for multi-member sharing"
```

---

## Task 5: Cargo feature flag — CLOAK_PROGRAM_ID configurável

**Files:**
- Modify: `programs/cloak-gatekeeper/Cargo.toml`
- Modify: `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs`

O `Cargo.toml` já tem um bloco `[features]` existente (linhas 11–16) com `default`, `cpi`, `no-entrypoint`, `no-idl`, `idl-build`.

- [ ] **Step 1: Adicionar feature `mainnet` ao Cargo.toml**

No bloco `[features]` existente de `programs/cloak-gatekeeper/Cargo.toml`, adicionar `mainnet = []` após `default = []`:

```toml
[features]
default = []
mainnet = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
idl-build = ["anchor-lang/idl-build"]
```

- [ ] **Step 2: Substituir a constante em execute_with_license.rs**

Em `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs`, localizar a linha:

```rust
pub const CLOAK_MOCK_PROGRAM_ID: Pubkey = pubkey!("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");
```

Substituir por:

```rust
#[cfg(not(feature = "mainnet"))]
pub const CLOAK_PROGRAM_ID: Pubkey = pubkey!("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");

#[cfg(feature = "mainnet")]
pub const CLOAK_PROGRAM_ID: Pubkey = pubkey!("Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h");
```

- [ ] **Step 3: Renomear todas as ocorrências de CLOAK_MOCK_PROGRAM_ID para CLOAK_PROGRAM_ID no mesmo arquivo**

Há 2 ocorrências de `CLOAK_MOCK_PROGRAM_ID` no handler de `execute_with_license.rs`. Substituir ambas por `CLOAK_PROGRAM_ID`:

```rust
// Verificação do program ID (por volta da linha 63):
require_keys_eq!(
    ctx.accounts.cloak_program.key(),
    CLOAK_PROGRAM_ID,
    CloakSquadsError::InvalidCpiTarget
);
```

A segunda ocorrência é no `pub const` que acabou de ser substituído no Step 2 — não há mais `CLOAK_MOCK_PROGRAM_ID` após os dois steps.

- [ ] **Step 4: Build devnet (sem feature — usa mock)**

```bash
anchor build
```

Esperado: compila sem erros. `CLOAK_PROGRAM_ID` resolve para `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`.

- [ ] **Step 5: Build mainnet (com feature — usa Cloak real)**

```bash
anchor build -- --features mainnet
```

Esperado: compila sem erros. `CLOAK_PROGRAM_ID` resolve para `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`.

- [ ] **Step 6: Commit antes do deploy**

```bash
git add programs/cloak-gatekeeper/Cargo.toml programs/cloak-gatekeeper/src/instructions/execute_with_license.rs
git commit -m "feat(gatekeeper): make CLOAK_PROGRAM_ID configurable via mainnet Cargo feature"
```

- [ ] **Step 7: Redeploy devnet**

```bash
anchor deploy --provider.cluster devnet
```

Esperado: output mostra `Program Id: WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J` (ID não muda, só bytecode).

- [ ] **Step 8: Verificar deploy**

```bash
solana program show WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J --url devnet
```

Esperado: `Last Deployed Slot` mais recente que antes.

- [ ] **Step 9: Commit pós-deploy**

```bash
git add Anchor.toml
git commit -m "chore(devnet): redeploy gatekeeper with configurable CLOAK_PROGRAM_ID"
```

---

## Checklist de conclusão

- [ ] `pnpm typecheck:all` passa sem erros
- [ ] POST `/api/proposals` retorna 429 após 10 req/min do mesmo IP
- [ ] Botão "Copy link" aparece na proposta e copia a URL corretamente
- [ ] Outro membro consegue abrir o link e votar (vê draft + status on-chain)
- [ ] `anchor build` compila com mock (default)
- [ ] `anchor build -- --features mainnet` compila com Cloak real
- [ ] Gatekeeper redeployado no devnet, `solana program show` confirma slot atualizado
