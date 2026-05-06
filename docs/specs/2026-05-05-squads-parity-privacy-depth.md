# Spec: Squads parity + Privacy depth

**Data:** 2026-05-05
**Status:** Draft → próximo agente implementa
**Owner:** TBD
**Esforço total:** ~7.5 dias
**Track:** Cloak / Frontier — fechar gap de migração com Squads.so e aprofundar a track de privacidade

---

## 0. Executive summary

Pacote de 4 features sequenciais, ordenadas por custo crescente. Cada uma é deployable de forma independente (não há dependências fortes entre elas), mas a ordem proposta minimiza retrabalho:

1. **Sub-vaults** (~1.5d) — parametrizar `vault_index`
2. **Encrypted memos** (~2d) — NaCl box no draft.memo
3. **Privacy meter** (~2d) — anonymity set UI
4. **Spending limits** (~2d) — Squads `multisigAddSpendingLimit` + `spendingLimitUse`

**Atualizado em ROADMAP.md:** seção P2 → "Squads parity + Privacy depth" (linhas ~80–112).

---

## 1. Contexto obrigatório (leia antes de codar)

Estes arquivos têm o contexto que NÃO está aqui. Leia nesta ordem:

1. `HANDOFF.md` — visão geral do projeto, padrões, gotchas
2. `ROADMAP.md` § P2 "Squads parity + Privacy depth" — versão resumida com checklists
3. `apps/web/lib/squads-sdk.ts` (320 linhas) — todos os helpers de Squads vivem aqui; é o ponto central de mudança pra sub-vaults e spending limits
4. `apps/web/prisma/schema.prisma` — modelos `ProposalDraft`, `PayrollDraft`, `StealthInvoice`, `Vault`, `VaultSettings`
5. `apps/web/components/vault/SendModal.tsx` (linhas 80–600) — fluxo completo de send, mais fácil de adaptar primeiro
6. `apps/web/app/vault/[multisig]/operator/page.tsx` — onde o operator decifra memos (depois da feature 2) e exibe privacy state
7. `packages/core/src/cloak-deposit.ts` — uso atual do Cloak SDK (referência pra Privacy meter)
8. `packages/core/src/squads-adapter.ts` (~120 linhas) — versão server-friendly de operações Squads (também tem `vaultIndex: 0` hardcoded)
9. **Memória persistente:** `/Users/rafazaum/.claude/projects/-Users-rafazaum-Desktop-cloak-squads/memory/MEMORY.md`

### Padrões de código a respeitar
- **Wallet auth:** sempre `useWalletAuth().fetchWithAuth(url, init)` no client.
- **Membership check:** todo POST/PATCH passa por `requireVaultMember(cofreAddress)` (`apps/web/lib/vault-membership.ts`). Endpoints sensíveis passam por `requireVaultOperator(multisig)`.
- **Validação:** todo body é parseado com Zod schema antes de tocar Prisma.
- **TanStack Query:** invalidations event-driven, sem polling por padrão.
- **DB:** `cofreAddress = multisig (frontend) = multisigPda (helpers on-chain)`. `transactionIndex` é `string` no DB, `bigint` on-chain.
- **Network:** `publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER` controla devnet/mainnet.
- **Padrão de proposal:** ver § 6.1 do `HANDOFF.md` (fundOperator + issueLicense + createVaultProposal + POST /api/proposals).

### Gotchas
- **Hardcoded `index: 0`** está em **6 lugares** dentro de `apps/web/lib/squads-sdk.ts` (linhas 75, 88, 151, 164, 268, 281) e mais em `packages/core/src/squads-adapter.ts`. Sub-vaults exige tocar todos.
- **`commitmentClaim`** é JSON serializado em `ProposalDraft.commitmentClaim` (string). NÃO confunda com `payloadHash` (Bytes).
- **NaCl box já está em uso** em stealth invoices (`StealthInvoice.stealthPubkey/signPubkey`). Reaproveitar a primitiva, não importar nova lib.
- **Cloak SDK** é `@cloak.dev/sdk-devnet` — não tem build de mainnet ainda. Toda escrita on-chain do pool passa por `transact()`/`fullWithdraw()`; leitura pra Privacy Meter precisa ser via `getProgramAccounts` direto (RPC).
- **Squads SDK** está em `node_modules/@sqds/multisig@2.1.4`. Spending limits ficam em `lib/instructions/multisigAddSpendingLimit.d.ts`, `multisigRemoveSpendingLimit.d.ts`, `spendingLimitUse.d.ts`.

---

## 2. Feature 1 — Sub-vaults (`vault_index` 0/1/2…)

**Objetivo:** suportar múltiplos vaults PDA por multisig (Squads v4 é nativo). Hoje hardcodamos `index: 0` em 6+ lugares.

**Por que primeiro:** plumbing barato. Bloqueia features futuras se deixado pro fim (memos, limits, payroll precisam saber qual vault). Zero crypto novo.

### 2.1 Mudanças em `apps/web/lib/squads-sdk.ts`
Adicionar `vaultIndex?: number` (default `0`) em:
- `createInitCofreProposal` (linhas 66–126)
- `createIssueLicenseProposal` (linhas 128–140)
- `createVaultProposal` (linhas 142–~240)
- todas as funções de config proposal (`createAddMemberProposal`, `createRemoveMemberProposal`, `createChangeThresholdProposal`)

Substituir os 6 hardcodes `index: 0` / `vaultIndex: 0` por `vaultIndex: params.vaultIndex ?? 0`.

Idem em `packages/core/src/squads-adapter.ts` (linhas 45, 101 — server-side equivalents).

### 2.2 Modelo Prisma novo
```prisma
model SubVault {
  id           String   @id @default(uuid())
  cofreAddress String   // o multisig
  vaultIndex   Int      // 0, 1, 2, ...
  name         String   // "Treasury", "Ops", "Grants"
  color        String?  // hex pra UI
  icon         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([cofreAddress, vaultIndex])
  @@index([cofreAddress])
}
```

`vault_index = 0` é sempre "Main" (criado implicitamente quando o multisig é criado). Sub-vaults adicionais são criados client-side só com metadata — Squads não exige nenhuma instrução on-chain pra "registrar" um vault novo (ele é PDA derivado, sempre existe; só precisa receber SOL pra ficar visível).

### 2.3 Drafts ganham `vaultIndex`
- `ProposalDraft`, `PayrollDraft`, `StealthInvoice`, `SwapDraft` ganham `vaultIndex Int @default(0)`.
- Migration sem default-on-existing seria custosa; o `@default(0)` resolve.

### 2.4 UI
- `VaultSelector` (`apps/web/components/app/VaultSelector.tsx`) ganha picker interno: clica no multisig → expande lista de sub-vaults.
- `AppShell` header mostra "Multisig X / Sub-vault Y".
- Nova rota `/vault/[multisig]/sub-vaults` — listar/criar/renomear/excluir sub-vaults (CRUD local-only do metadata; o vault PDA on-chain "existe" sem precisar de instrução).
- Ao criar uma sub-vault, mostrar o endereço PDA gerado (`multisig.getVaultPda({ multisigPda, index: N })`) pra o usuário fundear.

### 2.5 Gatekeeper / fundOperatorIx
`apps/web/lib/gatekeeper-instructions.ts` (`fundOperatorIx`) hoje pega o vault PDA index 0. Aceitar `vaultIndex` e derivar o PDA correto. O programa `cloak-gatekeeper` em si não precisa mudar — só vira fonte de SOL diferente.

### 2.6 Aceitação
- Send/Payroll/Invoice funcionam idênticos no vault index 0 (regression test).
- Criar uma sub-vault "Ops", fundar com 0.05 SOL, fazer um send privado dela: tudo passa, on-chain explorer mostra `vault PDA(index=1) → operator → Cloak pool`.

---

## 3. Feature 2 — Encrypted memos

**Objetivo:** o memo da proposta vira ciphertext. Hoje é texto puro no Postgres e qualquer operador/auditor com acesso ao DB lê.

**Reaproveitar:** stack NaCl `box` já em uso em stealth invoices (`tweetnacl` provavelmente já é dep transitivo do `@cloak.dev/sdk-devnet` — confirmar com `pnpm why tweetnacl`).

### 3.1 Crypto helpers
Novo arquivo `packages/core/src/memo-crypto.ts`:

```ts
import nacl from "tweetnacl";

export type EncryptedMemo = {
  ciphertext: Uint8Array;  // box(memo, nonce, recipientPk, ephemeralSk)
  nonce: Uint8Array;        // 24 bytes
  ephemeralPk: Uint8Array;  // 32 bytes — descartar ephemeralSk após cifrar
};

export function encryptMemo(memo: string, recipientVk: Uint8Array): EncryptedMemo {
  const ephemeralKp = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(
    new TextEncoder().encode(memo),
    nonce,
    recipientVk,
    ephemeralKp.secretKey,
  );
  return { ciphertext, nonce, ephemeralPk: ephemeralKp.publicKey };
}

export function decryptMemo(env: EncryptedMemo, sk: Uint8Array): string | null {
  const plain = nacl.box.open(env.ciphertext, env.nonce, env.ephemeralPk, sk);
  if (!plain) return null;
  return new TextDecoder().decode(plain);
}
```

Exportar em `packages/core/src/index.ts`.

### 3.2 Migration Prisma
`ProposalDraft`, `PayrollDraft`, `StealthInvoice`, `SwapDraft` ganham:
```prisma
memoCiphertext   Bytes?
memoNonce        Bytes?
memoEphemeralPk  Bytes?
```
Manter `memo String?` clear opcional (para drafts criados antes da feature; depois deprecar via flag `MEMO_CRYPTO_REQUIRED=1`).

### 3.3 Sender side (send/payroll/invoice)
Antes do `POST /api/proposals`, o client cifra:
- Para **Private send / Payroll**: `recipientVk = recipient stealth/box pubkey` (usar a `recipient_vk` derivada do UTXO, mesma usada pelo claim do invoice).
- Para **Stealth invoice**: `recipientVk = stealthPubkey` (já gerada).
- Para **Public send**: NÃO cifrar — memo público é OK.

Enviar `{ memoCiphertext, memoNonce, memoEphemeralPk }` em vez de `memo`. Validar com Zod schemas em `lib/validation.ts`.

### 3.4 Recipient / operator side
- **Operator page** (`apps/web/app/vault/[multisig]/operator/page.tsx`): tenta `decryptMemo(env, recipientSk)`. Recipient sk vem do `commitmentClaim` reconstruído (já disponível no operator). Fallback `[encrypted memo]` se falhar.
- **Claim page** (`apps/web/app/claim/[stealthId]/page.tsx`): decifra com a sk do fragment `#sk=`.
- **Audit links:**
  - `full_history` — viewer key opcional adicionada ao link permite decifrar (selective disclosure).
  - `amounts_only` / `time_ranged` — sempre mostram `[encrypted]`.

### 3.5 Aceitação
- Inspecionar Postgres direto: `SELECT memo, memo_ciphertext FROM proposal_drafts;` → memo é `null` em drafts novos.
- Operator + recipient leem o memo decifrado na UI.
- Auditor com link `amounts_only` vê `[encrypted]`.

---

## 4. Feature 3 — Privacy meter

**Objetivo:** mostrar anonymity set do pool Cloak antes do send. Mata a dúvida "minha tx fica privada mesmo?" com dado on-chain.

### 4.1 Coleta de dados
Novo arquivo `apps/web/lib/cloak-anonymity.ts`:

```ts
export type PoolStats = {
  mint: string;
  anonymitySet7d: number;   // deposits últimos 7d
  anonymitySet30d: number;  // últimos 30d
  poolDepthLamports: bigint;// total shielded
  riskScore: "low" | "medium" | "high"; // verde/amarelo/vermelho
  updatedAt: number;
};

export async function getPoolStats(connection, mint): Promise<PoolStats> {
  // 1. getProgramAccounts(CLOAK_PROGRAM_ID, filtro por mint)
  // 2. Contar leaves do merkle tree por slot range
  //    (se Cloak SDK expuser merkle root account, usar — senão parse manual)
  // 3. riskScore: >1000 = low, 100–1000 = medium, <100 = high
}
```

**Caveat:** se o Cloak SDK não expuser merkle leaf count diretamente, vai precisar `getProgramAccounts` + filtrar por discriminator do account de leaf. Investigar antes de codar — pode ser que `@cloak.dev/sdk-devnet` exporte algo (`merkleTree.getLeafCount` ou similar). Se não tiver, fallback: contar tx de deposit em uma janela com `getSignaturesForAddress(CLOAK_PROGRAM_ID)` e parse manual.

### 4.2 API + cache
`/api/cloak/pool-stats?mint=…`:
- Cache Redis 60s (já temos Redis pro rate limit — reutilizar `lib/rate-limit.ts` connection).
- Sem auth (dado público).

### 4.3 Componente UI
`apps/web/components/vault/PrivacyMeter.tsx`:
- Donut/bar com tamanho do anonymity set (label numérico).
- Pool depth em SOL.
- Risk badge colorido.
- Tooltip educativo: "Your transaction will hide among 1,432 other deposits in the last 30 days."
- Link pra `/vault/[ms]/privacy` — dashboard educativo com sparkline 7d.

Integrar em:
- `SendModal` (depois da seleção de mint, antes do submit)
- `app/vault/[multisig]/send/page.tsx`
- `app/vault/[multisig]/payroll/page.tsx`
- `app/vault/[multisig]/invoice/page.tsx`

### 4.4 Honestidade sobre threat model
Importante: a UI deve esclarecer **explicitamente** que `vault → operator` É público, e que o que quebra a correlação é o pool. Texto exemplo:

> "Operator hop is public — observers see 'vault → operator → Cloak pool'. The privacy guarantee is that no observer can prove which Cloak withdrawal corresponds to your vault deposit, because the pool has 1,432 other deposits to choose from."

Já temos esse padrão em `README.md` (seção "Privacy Model: What's Hidden, What's Visible") — replicar tom.

### 4.5 Aceitação
- Send modal mostra `Anonymity set: 1,432 (low risk)` antes do submit.
- Funciona pra SOL e USDC (assumindo SPL privacy implementada — se ainda não, só SOL).
- Cache hit no Redis (não bate `getProgramAccounts` por request).

---

## 5. Feature 4 — Spending limits

**Objetivo:** Squads parity + UX killer pro payroll. Membro paga até X SOL/dia/semana sem proposal — direto via `spendingLimitUse`.

### 5.1 Squads SDK (já disponível)
`@sqds/multisig@2.1.4` expõe:
- `multisig.instructions.multisigAddSpendingLimit({ multisigPda, configAuthority, spendingLimit, rentPayer, createKey, vaultIndex, mint, amount, period, members, destinations, memo })` — `Period` enum: `Day | Week | Month | OneTime`. **Add é via `configTransactionCreate` (multisig vota).**
- `multisig.instructions.multisigRemoveSpendingLimit(...)` — idem (config tx).
- `multisig.instructions.spendingLimitUse({ multisigPda, member, spendingLimit, mint, vaultIndex, amount, decimals, destination, tokenProgram, memo })` — **1 assinatura do membro autorizado, sem proposal.**

### 5.2 Helpers em `lib/squads-sdk.ts`
```ts
export async function createAddSpendingLimitProposal(params: {
  connection, wallet, multisigPda,
  vaultIndex: number,
  mint: PublicKey,
  amount: bigint,
  period: Period,
  members: PublicKey[],
  destinations: PublicKey[],  // [] = wildcard
}) { /* config tx wrap */ }

export async function createRemoveSpendingLimitProposal(...) { /* config tx wrap */ }

export function buildSpendingLimitUseIx(...): TransactionInstruction { /* direto */ }
```

`spendingLimit` PDA derivado: `multisig.getSpendingLimitPda({ multisigPda, createKey })`. Persistir `createKey` no DB pra rebuild.

### 5.3 Modelo Prisma
```prisma
model SpendingLimit {
  id            String   @id @default(uuid())
  cofreAddress  String   // multisig
  spendingLimit String   // PDA address
  createKey     String   // pra rebuild PDA
  vaultIndex    Int
  mint          String   // SOL = "So111..." ou SPL mint
  amountRaw     String   // bigint serializado
  period        String   // "Day" | "Week" | "Month" | "OneTime"
  members       String[] // pubkeys autorizadas
  destinations  String[] // [] = qualquer destino
  status        String   // "active" | "removed"
  createdAt     DateTime @default(now())

  @@index([cofreAddress])
  @@index([cofreAddress, status])
}
```

### 5.4 UI nova
`/vault/[multisig]/limits`:
- Lista limits ativos: mint, valor restante na janela, period, membros, destinos.
- "Add Spending Limit" → form → `createAddSpendingLimitProposal` → vai pro flow normal de proposal/aprovação.
- "Remove" → `createRemoveSpendingLimitProposal`.

### 5.5 SendModal integration
- Detectar limits aplicáveis: `(amount, mint, recipient, member) → matchingLimit?`.
- Se houver: toggle "Use spending limit (skip approval)" enabled.
- Toggle on → constrói `spendingLimitUseIx` + (opcional) `fundOperatorIx` + license para o flow privacy. Single-sign tx.
- Toggle off → fluxo normal de proposal.

### 5.6 Privacy bridge (importante!)
Quando o member usa o limit pro flow privado:
1. `spendingLimitUseIx` move SOL/USDC `vault → operator` (em vez de `fundOperatorIx` direto que requer proposal).
2. `issueLicenseIx` ainda precisa rodar — mas issue_license na verdade exige assinatura do **vault PDA** (`as_signer`). 

⚠️ **Atenção:** `spendingLimitUse` NÃO assina como vault PDA. Precisa investigar se o gatekeeper aceita `issue_license` assinado pelo membro com prova de `spending_limit_use` recente. Se não, **a feature de privacy bridge fica como follow-up** — primeira versão de spending limits faz só `vault → recipient` direto, **sem** routear pelo Cloak.

→ **Decisão:** v1 entrega spending limits para sends **públicos** apenas (parity Squads). v2 (follow-up) integra com Cloak quando o gatekeeper for adaptado pra aceitar member-signed license. Documentar como limitação no PR.

### 5.7 Aceitação
- Membro com limit "5 SOL/dia para qualquer destino" envia 1 SOL público sem aprovação. Funciona em 1 click + 1 sign.
- Após 5 SOL/dia, próxima tentativa falha com erro do programa Squads (`SpendingLimitExceeded`).
- Add/Remove via proposal normal funciona.

---

## 6. Ordem de execução recomendada

```
Dia 1–2: Sub-vaults
  - Refactor squads-sdk.ts + squads-adapter.ts
  - Schema migration (SubVault + vaultIndex em drafts)
  - VaultSelector + nova rota /sub-vaults
  - Smoke test: send no index 0 e 1

Dia 3–4: Encrypted memos
  - packages/core/src/memo-crypto.ts
  - Migration de campos memoCiphertext em 4 modelos
  - Sender encrypt em send/payroll/invoice
  - Operator/claim decrypt
  - Audit-link viewer key opcional

Dia 5–6: Privacy meter
  - lib/cloak-anonymity.ts (research no Cloak SDK primeiro!)
  - /api/cloak/pool-stats com Redis cache
  - <PrivacyMeter /> + integrar em 4 telas
  - /vault/[ms]/privacy dashboard

Dia 7–7.5: Spending limits
  - Helpers em squads-sdk.ts (3 funções)
  - Schema SpendingLimit
  - /vault/[ms]/limits CRUD
  - SendModal toggle (escopo: sends públicos)
  - Documentar limitação Cloak bridge como follow-up
```

Cada dia termina com smoke test no devnet + commit.

---

## 7. Não fazer (evitar scope creep)

- ❌ Não tentar fazer privacy bridge em spending limits na v1 (pode virar pesquisa de programa novo).
- ❌ Não migrar todos os clears de `memo` para ciphertext — manter dual-write até feature ser dogfooded por 2 semanas.
- ❌ Não adicionar UI de "criar sub-vault" via instrução on-chain — é só metadata local; vault PDA existe sem precisar de tx.
- ❌ Não inventar componente de design novo — reaproveitar `<InfoCallout>`, `<SignatureProgress>`, `<NetworkStatusChip>` (já existentes em `apps/web/components/ui/`).
- ❌ Não tocar no programa `cloak-gatekeeper` (Anchor) — todas as 4 features são puramente off-chain + Squads SDK.

---

## 8. Smoke checklist final

Antes de declarar done:
- [ ] `pnpm prebuild:web` passa
- [ ] `pnpm test:unit` passa
- [ ] Rodar `/vault/[ms]/send` em devnet com cada uma das 4 features tocando o fluxo
- [ ] Inspecionar Postgres: `memo` é null, `memoCiphertext` populated, `vaultIndex` correto
- [ ] Inspecionar Solana explorer: tx mostra vault PDA correto (index N), operator, Cloak pool
- [ ] Atualizar `ROADMAP.md` marcando os 4 itens como `[x]`
- [ ] Atualizar memória `/Users/rafazaum/.claude/projects/-Users-rafazaum-Desktop-cloak-squads/memory/MEMORY.md` com as features concluídas
