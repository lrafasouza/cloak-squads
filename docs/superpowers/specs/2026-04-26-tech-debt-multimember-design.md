# Design: Technical Debt Cleanup + Multi-Member UX

**Date:** 2026-04-26  
**Scope:** A+B — dívida técnica do F1 + melhorias multi-membro, pré-requisito para F2

---

## Objetivo

Fechar os gaps técnicos do F1 antes de avançar para F2 (Payroll batch):

1. Corrigir `buildIssueLicenseProposal` (código morto / instrução faltando)
2. Adicionar rate limit no POST `/api/proposals`
3. Adicionar botão "Copy link" na página de proposta
4. Tornar `CLOAK_PROGRAM_ID` configurável via Cargo feature flag + redeploy devnet

---

## Mudanças

### 1. Fix `squads-adapter.ts`

**Arquivo:** `packages/core/src/squads-adapter.ts`

**Problema:** `buildIssueLicenseProposal` cria a `vaultTransactionCreate` mas não cria o `proposalCreate`. Scripts que usam essa função criariam a vault tx sem o proposal correspondente. `void createTx` descarta a signature sem necessidade.

**Fix:**
- Adicionar `proposalCreate` logo após `vaultTransactionCreate`
- Enviar ambas as instruções numa única transação
- Retornar `{ transactionIndex, vaultTransactionPda, signature }`

**Consumidores:** `apps/web/lib/squads-sdk.ts` → `createIssueLicenseProposalWithSigner` (usado por scripts CLI, não pelo browser flow)

---

### 2. Rate limit em `POST /api/proposals`

**Arquivos novos/alterados:**
- `apps/web/lib/rate-limit.ts` — helper in-memory
- `apps/web/app/api/proposals/route.ts` — aplicar no handler POST

**Algoritmo:** Fixed Window Counter por IP (sem pacote externo)

```typescript
// apps/web/lib/rate-limit.ts
const map = new Map<string, { count: number; reset: number }>();

export function checkRateLimit(
  ip: string,
  limit = 10,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const entry = map.get(ip) ?? { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  map.set(ip, entry);
  return true;
}
```

**Aplicação no route handler:**
```typescript
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  // resto do handler: parse body, validate com Zod, persist no Prisma
}
```

**Parâmetros:** 10 req / 60s por IP. Suficiente para devnet; sem Redis necessário nessa escala.

**Nota:** GETs não recebem rate limit — são leitura de SQLite local, sem risco de flood.

---

### 3. Copy link button na página de proposta

**Arquivo:** `apps/web/app/cofre/[multisig]/proposals/[id]/page.tsx`

**Adições:**
- Botão "Copy link" ao lado do header da proposta, usando `navigator.clipboard.writeText(window.location.href)`
- Texto instrucional: "Share this link with other signers"
- Feedback visual ao copiar (ex: texto muda para "Copied!" por 2s)

**Comportamento para outros signatários que abrem o link:**
- Veem amount, recipient, memo (do Prisma draft)
- Veem status on-chain `X/Y approvals`
- Aviso âmbar: "Commitment claim is only available in the proposer's browser session" — mantido como está
- Botão Approve desbloqueado (voto permitido sem o claim)

**Sem mudanças no modelo de segurança** — `commitmentClaim` permanece apenas em `sessionStorage` do proponente.

---

### 4. Cargo feature flag para `CLOAK_PROGRAM_ID`

**Arquivos alterados:**
- `programs/cloak-gatekeeper/Cargo.toml` — adicionar feature `mainnet`
- `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs` — trocar constante hardcoded por `#[cfg]`
- `Anchor.toml` — documentar o build command para mainnet

**Implementação:**

```toml
# programs/cloak-gatekeeper/Cargo.toml
[features]
mainnet = []
```

```rust
// execute_with_license.rs — substituir a constante existente
#[cfg(not(feature = "mainnet"))]
pub const CLOAK_PROGRAM_ID: Pubkey = pubkey!("2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe");

#[cfg(feature = "mainnet")]
pub const CLOAK_PROGRAM_ID: Pubkey = pubkey!("Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h");
```

A referência interna `CLOAK_MOCK_PROGRAM_ID` é renomeada para `CLOAK_PROGRAM_ID` para refletir que agora é configurável.

**Builds:**
- Devnet (mock): `anchor build`
- Mainnet (real Cloak): `anchor build -- --features mainnet`

**Redeploy devnet:** necessário após essa mudança. O programa ID do gatekeeper (`WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J`) não muda — apenas o bytecode.

---

## Ordem de execução (Opção 2 — Rust por último)

1. Fix `squads-adapter.ts` (core package)
2. Rate limit helper + aplicar no route
3. Copy link button + instrucional text
4. Cargo feature flag no Rust + redeploy devnet

---

## O que NÃO está no escopo

- Notificação push para outros membros assinarem (F2+)
- Redis para rate limit distribuído (escala desnecessária em devnet)
- Mudança no modelo de segurança do `commitmentClaim`
- Threshold maior para `set_operator` (SECURITY.md issue, fica para mainnet hardening)

---

## Critérios de sucesso

- `buildIssueLicenseProposal` via script CLI cria vault tx + proposal corretamente
- POST `/api/proposals` retorna 429 após 10 req/min do mesmo IP
- Qualquer membro consegue abrir o link da proposta e votar
- `anchor build` compila sem feature → usa mock; `anchor build -- --features mainnet` → usa Cloak real
- Todos os typechecks passam (`pnpm typecheck:all`)
