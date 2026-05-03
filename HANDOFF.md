# Cloak Squads — Handoff / Spec para Próximo Agente

> **Objetivo deste doc**: dar contexto completo de arquitetura, fluxos e pendências
> para o próximo agente de IA (ou dev humano) conseguir pegar o trabalho sem
> re-explorar o codebase do zero.

---

## 1. Contexto do Produto

**Cloak Squads** é um wrapper de privacidade em cima do **Squads Protocol**
(multisig nativo de Solana). Cada multisig recebe um "Cofre" on-chain gerenciado
pelo programa `cloak-gatekeeper`, que emite **Licenses** para autorizar
transfers privadas via o shielded pool da **Cloak** (ZK proofs).

Casos de uso primários:
- Tesouraria privada com aprovação multisig (pagamentos, payroll, invoices)
- Audit links escopados para compliance externa
- Stealth invoices (claim links) para receber sem expor endereços

---

## 2. Stack

| Camada | Tech |
|---|---|
| Monorepo | pnpm workspaces + Turbo |
| Frontend | Next.js 14 App Router, React 18, Tailwind, shadcn/ui, TanStack Query |
| Wallet | `@solana/wallet-adapter-react` |
| On-chain | Anchor programs (`cloak-gatekeeper`), `@sqds/multisig`, `@cloak.dev/sdk-devnet` |
| Backend | Next.js API routes, Prisma + Postgres, Zod validation |
| Auth | Wallet signature headers (ed25519) |
| Deploy | Render (render.yaml), Docker para Postgres dev |

Paths-chave:
- `apps/web/` — Next.js app
- `apps/web/app/vault/[multisig]/*` — telas por feature
- `apps/web/app/api/*` — API routes
- `apps/web/lib/*` — client helpers + hooks
- `apps/web/prisma/schema.prisma` — DB
- `packages/core/src/*` — crypto/SDK shared (commitment, hashing, PDA, audit)
- `programs/cloak-gatekeeper/` — Anchor program (License, Cofre, AuditLink)

---

## 3. Mapa de Fluxos (resumo)

### 3.1 Fluxo principal: Send Private → Proposals → Operator

1. **Send** (`/vault/[ms]/send`): membro cria UTXO → commitment → `buildIssueLicenseIx`
   + `fundOperatorIx` (SOL vault→operator) → `createVaultProposal` (Squads) → persiste
   draft via `POST /api/proposals`.
2. **Proposals** (`/vault/[ms]/proposals`): signers aprovam / cancelam. Tabs:
   queue, history, drafts, income.
3. **Operator** (`/vault/[ms]/operator`): wallet registrada no Cofre executa:
   - Reconstrói UTXO do `commitmentClaim`
   - `cloakDepositBrowser` (deposit shielded)
   - Delivery: `fullWithdraw` (F1 direct) **ou** `PATCH /api/stealth/[id]/utxo` (F4 invoice)
   - `buildExecuteWithLicenseIx` + execute Squads proposal

### 3.2 Outras features
- **Invoice** (`/vault/[ms]/invoice`): cria `StealthInvoice` + proposal → claim link
  `/claim/[id]#v=1&sk=...&vault=...`
- **Claim** (`/claim/[id]`): recipient reconstrói UTXO → `fullWithdraw` → marca claimed
- **Payroll** (`/vault/[ms]/payroll`): CSV → batch de até 10 UTXOs → modos `direct`/`invoice`
- **Audit** (`/vault/[ms]/audit`): cria audit links escopados (`full`/`amounts_only`/`time_ranged`),
  revoga via proposal on-chain
- **Public Audit** (`/audit/[linkId]`): view escopada para auditores externos
- **Create / Settings / Members**: CRUD de multisig

> **Doc de referência completa**: ver histórico da conversa — o agente anterior
> gerou um mapa detalhado. Reproduzi o essencial aqui, mas leia os arquivos
> listados na seção 4 antes de modificar.

---

## 4. Arquivos que o próximo agente deve ler primeiro

Ordem recomendada:

1. `apps/web/components/app/AppShell.tsx` — shell + nav (descobrir estrutura de rotas)
2. `apps/web/app/vault/[multisig]/send/page.tsx` — fluxo Send (representa o padrão das proposals)
3. `apps/web/app/vault/[multisig]/operator/page.tsx` — **1803 linhas**, heart do execution
4. `apps/web/app/vault/[multisig]/invoice/page.tsx` e `app/claim/[stealthId]/page.tsx` — invoices
5. `apps/web/app/api/proposals/route.ts` — backend pattern (zod + wallet auth + prisma)
6. `apps/web/lib/wallet-auth.ts` — auth scheme (⚠️ incompleto, ver Sprint 1)
7. `apps/web/prisma/schema.prisma` — modelagem
8. `packages/core/src/` — crypto/commitment/audit lógica compartilhada
9. `programs/cloak-gatekeeper/src/` — programa Anchor (verificar antes de mudar payload)

---

## 5. Pendências (backlog priorizado)

### 🔴 Sprint 1 — Segurança (blocker para mainnet)

#### S1.1 Membership check em `requireWalletAuth`
- **File**: `apps/web/lib/wallet-auth.ts`
- **Problema**: `requireWalletAuth` é placeholder (ver comentário linha 80-83). Qualquer
  wallet autenticada pode criar drafts/invoices em vaults de terceiros.
- **Aceitação**:
  - Nova fn `requireVaultMember(multisigAddress)` lê on-chain `Multisig.members`
  - Cache de 60s (Map em memória ok por enquanto, migrar para Redis com S1.5)
  - Todas rotas `/api/proposals`, `/api/payrolls`, `/api/stealth` (POST) e `/api/audit-links`
    (POST) passam a usar `requireVaultMember` em vez de `requireWalletAuth`
  - Teste: wallet não-membro recebe 403

#### S1.2 Operator-only gate para `includeSensitive`
- **Files**: `apps/web/app/api/proposals/[multisig]/[txIndex]/route.ts`,
  `apps/web/app/api/payrolls/[multisig]/[txIndex]/route.ts`
- **Problema**: qualquer caller com `?includeSensitive=true` recebe `commitmentClaim`
  (chaves privadas do UTXO).
- **Aceitação**:
  - Server decodifica `Cofre` on-chain, lê `operator` pubkey
  - Se `auth.publicKey !== operator` → 403 mesmo com flag
  - Logs estruturados de quem acessou dados sensíveis

#### S1.3 Cifrar secrets em `StealthInvoice`
- **File**: `apps/web/prisma/schema.prisma` (StealthInvoice)
- **Problema**: `utxoPrivateKey`, `utxoBlinding`, `utxoCommitment`, `utxoPublicKey`
  armazenados em claro. `amountHintEncrypted` tem nome enganoso (é texto puro).
- **Aceitação**:
  - Envelope encryption: chave derivada do `sk` do claim link (nunca enviado ao server
    em texto — client prova posse via challenge-response).
  - `utxo*` fields viram `Bytes` (ciphertext AEAD, ex: XChaCha20-Poly1305)
  - Amount hint opcionalmente cifrado (aceitar preview desligado)
  - Migration reversível (guardar tabela staging antes do drop de colunas)

#### S1.4 Challenge-response no claim
- **File**: `apps/web/app/api/stealth/[id]/claim-data/route.ts`
- **Problema**: cliente envia `accessKey` no body. Comparação servidor-side =
  secret sai do cliente para o server em claro.
- **Aceitação**:
  - Server gera challenge (32 bytes) armazenado 60s
  - Cliente responde com `nacl.sign(challenge, claimKeypair.secretKey)`
  - Server verifica com `stealthPubkey` (já persistido)
  - `sk` nunca sai do browser

#### S1.5 Rate limit Redis
- **File**: `apps/web/lib/rate-limit.ts`
- **Problema**: Map in-memory, per-process, sem eviction.
- **Aceitação**: adapter Upstash (ou equivalente). Interface atual preservada.
  Fallback para in-memory em dev.

#### S1.6 Rota dedicada de invoice por ID
- **Files**: remover uso de `GET /api/stealth/[vault]` do claim
- **Problema**: `ClaimPage` lista todas as invoices do vault e filtra client-side.
- **Aceitação**:
  - Nova rota `GET /api/stealth/invoice/[id]` sem auth, retornando apenas fields públicos
    (id, cofreAddress, recipientWallet, status, expiresAt, stealthPubkey, memo, invoiceRef)
  - `ClaimPage` passa a usar essa rota
  - Rota antiga passa a exigir membership

#### S1.7 Auth sem replay
- **File**: `apps/web/lib/wallet-auth.ts`
- **Problema**: mesma assinatura vale por 5min em qualquer endpoint.
- **Aceitação**:
  - Mensagem passa a incluir `method + path + sha256(body)`
  - Janela reduzida para 90s
  - Cliente (`use-wallet-auth.ts`) atualizado para assinar por request

---

### 🔴 Sprint 2 — Arquitetura

#### S2.1 Validação on-chain de drafts no POST
- **File**: `apps/web/app/api/proposals/route.ts`
- **Aceitação**: antes do `prisma.create`, fetch `Proposal.fromAccountAddress` e
  comparar hash das instruções com `payloadHash`. 400 se divergir.

#### S2.2 Mover execução do operator para worker
- **Scope**: grande — extrair `executeSingle` e `executePayroll` do frontend para
  um serviço Node (rodando no Render worker).
- **Aceitação**:
  - Nova tabela `ExecutionJob` (status, retries, lastError)
  - Worker poll/queue (BullMQ ou Inngest)
  - Frontend vira read-only dashboard com progresso
  - Cache de deposit sessionStorage pode sumir

#### S2.3 Unificar ProposalDraft e PayrollDraft
- **Scope**: médio
- **Aceitação**: um modelo `Proposal` com `items: Item[]` (onde `single` = length 1).
  Migração com dual-write fase 1 → swap fase 2.

#### S2.4 Paginação em GETs
- Todos os list endpoints passam a suportar `?cursor=&limit=`.

#### S2.5 Dispatch de webhooks
- **File**: `VaultSettings.webhookUrl` já existe no schema mas nunca é disparado.
- **Aceitação**: após evento on-chain relevante (proposal created/approved/executed)
  o worker (S2.2) POSTa payload assinado ao webhookUrl.

---

### 🟡 Sprint 3 — UX

#### S3.1 Auto-execute quando threshold=1
Em `send/page.tsx`, se `vault.threshold === 1 && wallet === operator`, rodar
sign+execute sem redirecionar. UI mostra single transaction progress.

#### S3.2 Esconder "Operator" nav para não-operators
`AppShell.tsx:59-65` — checar `registeredOperator === wallet.publicKey` antes de
renderizar o item. Keep route accessible via URL.

#### S3.3 Real-time status
Usar `refetchInterval: 5000` no `useProposalSummaries` quando houver queue ativa.
Idealmente: Helius webhook → websocket.

#### S3.4 Filtros na Proposals page
Adicionar: search por recipient address, filter por kind (transfer/payroll/settings),
date range.

#### S3.5 Error translator estendido
Extender `lib/cloak-progress.ts` com erros comuns do operator flow
(proof invalid, insufficient deposit, stale merkle tree, etc).

#### S3.6 Fee preview no operator
Antes do execute, mostrar "estimated cost: ~0.02 SOL (ZK proof + tx fees)".

#### S3.7 Claim page fallback sem wallet
Mostrar details da invoice + CTA "Install Phantom" quando `!wallet.publicKey`.

#### S3.8 Remover duplicação sessionStorage
Secrets já estão no DB; sessionStorage vira confusão. Remover, confiar em backend cifrado
(depende de S1.3).

---

### 🟡 Sprint 4 — Design System

#### S4.1 Normalizar tokens
Substituir `red-*`, `neutral-*`, `amber-*` crus por `signal-danger`, `ink`, `signal-warn`
(ver `app/globals.css`). Grep por `-red-`, `-neutral-`, `-amber-` em `app/`.

#### S4.2 A11y pass
- Toggles custom → `role="switch"` + `aria-checked`
- `<div onClick>` → `<button type="button">`
- Toasts com `aria-live="polite"`
- QR code com caption texto abaixo

#### S4.3 Mobile para tabelas densas
`payroll/page.tsx` preview table vira cards empilhados em `<md`.

#### S4.4 PageLoader unificado
Criar `components/ui/page-loader.tsx` com variantes `skeleton | spinner | inline`.
Substituir 4+ loadings inconsistentes.

---

### 🟢 Sprint 5 — DX & Observability

- **S5.1** Structured logging (pino)
- **S5.2** Sentry (frontend + API routes)
- **S5.3** Testes e2e Playwright do fluxo Send→Sign→Execute→Claim
- **S5.4** Gerar types do IDL com `anchor idl type`
- **S5.5** Remover campos legacy `r` / `sk_spend` do `commitmentClaimSchema`
- **S5.6** Adicionar `prisma/dev.db*` ao `.gitignore`

---

## 6. Padrões e convenções

### 6.1 Proposals (padrão Send/Invoice/Payroll)
Todo fluxo que gera license segue:
```ts
assertCofreInitialized()
decode Cofre → operator pubkey
fundOperatorIx = SystemProgram.transfer(vault → operator, amount)
buildIssueLicenseIxBrowser({ multisig, payloadHash, nonce })
createVaultProposal({ instructions: [fundOperatorIx, licenseIx] })
POST /api/proposals (persist draft com invariants + commitmentClaim)
```

### 6.2 Transaction progress
Sempre usar `useTransactionProgress` com steps semanticamente nomeados
(`validate` → `commitment` → `squads` → `persist`).

### 6.3 Wallet auth (cliente)
`useWalletAuth().fetchWithAuth(url, init)` injeta headers automaticamente.

### 6.4 Naming
- `cofreAddress` no backend === `multisig` no frontend === `multisigPda` em helpers on-chain
- `transactionIndex` é sempre `string` no DB e `bigint` on-chain

---

## 7. Gotchas conhecidos

1. **Circuits ZK são ~10MB** — carregados via `/api/circuits` proxy para burlar CORS S3.
2. **Cloak direct mode** (`cloakDirectTransactOptions`) é usado em operator para não
   depender de `/health` do relay.
3. **Nonce do payload** (16 bytes) é o que diferencia licenses idênticas — nunca reusar.
4. **Squads SDK** usa `@sqds/multisig` com wrapper em `lib/squads-sdk.ts` (ver
   `createVaultProposal`, `createIssueLicenseProposal`, `proposalCancel`).
5. **Devnet vs Mainnet**: `publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER` controla; audit export
   usa mock determinístico quando não há dados reais.
6. **Payroll cap = 10** é arbitrário no UI (`payroll/page.tsx`), mas tx do Squads tem
   limite de tamanho — validar antes de aumentar.

---

## 8. Primeiros passos recomendados

Se você é o próximo agente pegando esse projeto:

1. Rode `pnpm install` e `pnpm dev` com Postgres local (`docker-compose up`)
2. Leia `apps/web/app/vault/[multisig]/send/page.tsx` inteiro
3. Leia `HANDOFF.md` (este doc) + `ROADMAP.md` + `README.md`
4. Pegue **S1.1 (membership check)** como primeira tarefa — tem escopo claro,
   desbloqueia várias outras, e força você a entender auth + on-chain read
5. Antes de qualquer mudança no schema Prisma, confirmar que nenhuma migration
   foi aplicada fora do repo (`pnpm prisma migrate status`)

---

## 9. Contato / contexto adicional

- Conversa anterior com o agente gerou:
  - Mapa completo de fluxos (todas features + API routes + on-chain programs)
  - Análise de melhorias (45 itens categorizados por severidade)
- Ambos ficam registrados no histórico do Cascade; este handoff é o destilado
  acionável.
