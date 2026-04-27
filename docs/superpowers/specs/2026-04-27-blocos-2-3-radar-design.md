# Blocos 2 + 3 + Deploy Radar — Design

**Data:** 2026-04-27
**Status:** Aprovado para implementação
**Autor:** Brainstorming (Claude + rafazaum)
**Hackathon:** Cloak Track (Superteam Earn) — deadline 2026-05-14

---

## Tese central do produto

**Squads governance + Cloak privacy.** O projeto entrega um cofre onde:

- **Squads** fornece a camada de governança multisig (propostas, votos, vault execution)
- **Cloak** fornece a camada de privacidade (depósitos shielded, ZK proofs, nullifiers)
- O **gatekeeper** (programa próprio) liga as duas: emite licenças derivadas de execuções aprovadas pelo Squads, e essas licenças autorizam interações privadas com Cloak

Esta spec NÃO altera essa tese — pega o estado atual (F1 single-tx, F2 batch payroll, F3 audit, F4 stealth invoicing implementados) e adiciona testes, scripts e documentação para chegar a um demo estável em devnet.

---

## Escopo

**Em escopo:**
- **Bloco 2** — testes de integração (3 ficheiros novos) + teste unit (1 ficheiro novo) + testes devnet opcionais
- **Bloco 3** — scripts de seed, compliance export, deploy wrappers (4 ficheiros novos) + wrapper `cloakDeposit()` em `packages/core/` (Bloco 3.5)
- **Deploy Radar** — 3 docs novos (`DEVNET_DEMO_READY.md`, `CLOAK_MOCK_REMOVAL.md`, `TECH_DEBT.md`)

**Fora de escopo:**
- **Bloco 4 (Polimento)** — em execução pelo utilizador em paralelo
- **Bloco 5 (Cloak-Mock Removal)** — spec separada futura; runbook documentado em `CLOAK_MOCK_REMOVAL.md`
- Mudanças em `programs/`, `packages/core/` (existentes), `apps/web/lib/env.ts`, `apps/web/lib/prisma.ts`
- Migração SQLite → Postgres (não necessário para devnet demo)

**Premissa de target:** Demo estável em **devnet apenas**. Sem planeamento de mainnet nesta spec.

---

## Verificação contra fontes oficiais (2026-04-27)

Antes de finalizar este design, validei contra:

- `https://docs.cloak.ag/development/devnet` — doc oficial Cloak
- `https://superteam.fun/earn/listing/cloak-track` — apenas bounty (sem técnica)
- `docs/cloak-real-integration-analysis.md` — análise interna existente (371 linhas)
- Código existente em `programs/`, `apps/web/`, `tests/`, `scripts/`

**Constatações da doc oficial Cloak que afetam este design:**

1. Cloak **não fornece infraestrutura de testes** (mock, testkit, fixtures, fork). Confirma split de teste em 3 camadas.
2. Account layouts e instruction discriminators **não são publicamente documentados**. Confirma que CPI direto gatekeeper→Cloak (Option C do `cloak-real-integration-analysis.md`) é inviável; Option B é o único caminho para o Bloco 5 futuro.
2.b. **Resposta oficial da Cloak team ao bug report `docs/cloak-discord-report.md`:** confirmaram que `sdk.deposit()` está broken (disc-1 retired, agora `TransactSwap`). Workaround endossado: chamar `transact()` diretamente. Forneceram snippet de referência baseado no código vivo de `devnet/web/hooks/use-cloak-sdk.ts:611` (a app em `devnet.cloak.ag`). Layout: 7 contas para SOL deposit, 12 para SPL. Este snippet vira `packages/core/src/cloak-deposit.ts` (Bloco 3.5).
3. **Devnet é resetada periodicamente pela Solana Foundation.** UTXOs e PDAs não persistem indefinidamente.
4. **Settlement delay**: depósito requer ~20s entre `transact()` e assertions on-chain.
5. Sanctions screening está desabilitada em devnet, mas o **relay continua mandatório** (`https://api.devnet.cloak.ag`) porque o programa exige Ed25519 quote signed.
6. Constantes adicionais disponíveis: `DEVNET_MOCK_USDC_MINT`, `getNkFromUtxoPrivateKey`, `swapWithChange` (registadas em `TECH_DEBT.md` para expansão futura).

---

## Bloco 2 — Testes

### Arquitetura de 3 camadas

```
tests/
├── integration/                ← bankrun + cloak-mock (RÁPIDO, CI obrigatório)
│   ├── helpers/
│   │   └── gatekeeper.ts       (existente)
│   ├── f1-send.test.ts         (existente)
│   ├── f2-batch.test.ts        (existente)
│   ├── gatekeeper-instructions.test.ts (existente)
│   ├── spike-cpi.test.ts       (existente)
│   ├── f3-audit.test.ts        ← NOVO
│   └── e2e-full-flow.test.ts   ← NOVO
│
├── unit/                       ← Node puro, vitest (RÁPIDO, CI obrigatório)
│   └── f4-stealth.test.ts      ← NOVO
│
└── devnet/                     ← live devnet, gated (LENTO, MANUAL)
    └── cloak-deposit.devnet.test.ts ← NOVO (opcional)
```

### Razão do split

| Camada | Quando usar | Por que aqui |
|---|---|---|
| `integration/` (bankrun) | Lógica do gatekeeper Rust, CPI mock, state machines | Cloak não tem testkit; bankrun é a única forma rápida de testar o gatekeeper isoladamente |
| `unit/` (Node) | Cripto, HTTP routes, Prisma, lógica TS pura | F4 não toca chain — bankrun seria overhead |
| `devnet/` (live) | Verificar `transact()` real do Cloak SDK | Única forma de testar o caminho Cloak real (per docs oficiais) |

### `tests/integration/f3-audit.test.ts`

**Setup:** reaproveita `initCofre`, `initViewDistribution`, `processTx` de `helpers/gatekeeper.ts`.

**Casos:**
1. `deriveScopedAuditKey` — output determinístico para mesmos inputs, em todos os 4 scopes (`SingleTx`, `Range`, `Memo`, `Aggregate`)
2. `filterAuditData` — para cada scope, rejeita txs fora do critério e aceita as válidas
3. `exportAuditToCSV` — header correto, escape de vírgulas/aspas, ordenação determinística
4. `revoke_audit` instrução do gatekeeper:
   - Antes: `revoked_audit.set` vazio
   - Chamar `revoke_audit(diversifier_X)`
   - Depois: `revoked_audit.set.length == 1`, contém `diversifier_X`
   - Re-revoke do mesmo diversifier: idempotente (não duplica)

**Tamanho estimado:** ~150 linhas, 1 ficheiro

### `tests/integration/e2e-full-flow.test.ts`

Teste integrador único, sequencial, F1→F2→F3:

```
1. setup multisig fixture + initCofre + initViewDistribution
2. F1 single:
   - issue_license(payload_A)
   - execute_with_license(payload_A)
   - assert: license_A.status == Consumed
3. F2 batch:
   - issue_license(payload_B), issue_license(payload_C), issue_license(payload_D)
   - chained execute_with_license(B, C, D)
   - assert: license_B/C/D.status == Consumed
4. F3 audit:
   - revoke_audit(diversifier_E)
   - assert: revoked_audit contains E
5. Final assert:
   - mock pool tx_count == 4 (1 single + 3 batch)
```

**Tamanho estimado:** ~200 linhas, 1 ficheiro. Roda por último (mais lento).

### `tests/unit/f4-stealth.test.ts`

**Runtime:** vitest (NÃO bankrun). DB Prisma temporário (`file:./test-stealth-{pid}.db`, isolado, cleanup no `afterAll`).

**Casos:**
1. `nacl.box.keyPair()` produz par válido (pubkey 32 bytes, secret 32 bytes)
2. `encryptViewKeyForSigner` → `decryptViewKey` round-trip preserva bytes exatos
3. URL fragment build/parse: `#sk=...&id=...` → reconstrução lossless
4. HTTP flow contra rotas Next.js:
   - `POST /api/stealth { cofreAddress, recipientWallet, amount, ... }` → 201 + `id`
   - `GET /api/stealth/[cofre]` → lista contém o `id` criado
   - Mock de claim: atualiza `status = "claimed"` no DB

**Tamanho estimado:** ~120 linhas, 1 ficheiro

**Dependência nova:** `vitest` como devDep (atualmente não instalado)

### `tests/devnet/cloak-deposit.devnet.test.ts` (opcional, gated)

**Skip se:**
- `process.env.RUN_DEVNET_TESTS !== "1"` (default), OU
- `fetch("https://api.devnet.cloak.ag/health")` falhar (relay down — skip, não fail)

**Setup:** assume cofre demo já existe em devnet via `pnpm demo:setup` (D1 da brainstorming, decisão tomada).

**Caso único:**
1. Importar `cloakDeposit` de `@cloak-squads/core` (Bloco 3.5)
2. Chamar `cloakDeposit(connection, payer, 10_000_000n)` — 0.01 SOL (mínimo SDK)
3. Assert `result.signature` é string base58 válida (≥64 chars)
4. `await sleep(20_000)` — settlement delay per docs Cloak
5. Assert tx confirmada via `connection.getSignatureStatus`
6. Assert leaf index é número ≥ 0
7. Assert spendKeyHex e blindingHex são hex de 64 chars
8. (não chamar `sdk.deposit()` em nenhum momento — está broken até Cloak corrigir)

**Test timeout:** 60s (default 5s não chega)

**Custo:** ~0.01 SOL por execução. Documentado no header do ficheiro.

### Comandos no `package.json` raiz

Adicionar:

Atualizar `test:int` existente para incluir os 2 ficheiros novos (f3-audit, e2e-full-flow). Adicionar:

```jsonc
{
  "scripts": {
    "test:unit": "vitest run tests/unit",
    "test:devnet": "RUN_DEVNET_TESTS=1 node --experimental-strip-types tests/devnet/cloak-deposit.devnet.test.ts",
    "test:all": "pnpm test:int && pnpm test:unit"
  }
}
```

`test:all` NÃO inclui `test:devnet` (custo SOL + flaky por dependência de relay).

---

## Bloco 3 — Scripts

### `scripts/seed-test-data.ts` — idempotente com `--reset`

**Comportamento:**

```
sem flag:
  - lê .demo-data.json
  - se ficheiro não existe → seed completo, escrever .demo-data.json
  - se ficheiro existe:
    - verificar Prisma: todos os IDs em .demo-data.json existem? Se não → re-seed deltas
    - verificar on-chain: connection.getAccountInfo(cofrePda) != null?
      - Se null (devnet foi resetada) → log "devnet appears reset, regenerating cofre" + seed completo

com --reset:
  - prisma migrate reset --force
  - apagar .demo-data.json
  - seed completo
```

**Conteúdo gerado (1 execução completa):**

| Tipo | Quantidade | Onde |
|---|---|---|
| Multisig fixture (Squads) | 1 | on-chain (reaproveita `setup-demo-cofre.ts`) |
| Cofre PDA + view distribution | 1 | on-chain |
| Mock pool (cloak-mock) | 1 | on-chain |
| ProposalDraft (single-tx) | 1 | Prisma |
| ProposalDraft + PayrollDraft (3 recipients) | 1 | Prisma |
| ProposalDraft (com memo) | 1 | Prisma |
| AuditLink (scope=Range) | 1 | Prisma |
| AuditLink (scope=SingleTx) | 1 | Prisma |
| StealthInvoice (status=pending) | 1 | Prisma |

**Output `.demo-data.json` (gitignored):**

```json
{
  "cofreAddress": "...",
  "multisigPda": "...",
  "viewDistributionPda": "...",
  "mockPoolPda": "...",
  "proposalDraftIds": ["...", "...", "..."],
  "auditLinkIds": ["...", "..."],
  "stealthInvoiceId": "..."
}
```

### `scripts/compliance-export.ts` — CLI puro

**Uso:**

```bash
pnpm tsx scripts/compliance-export.ts <cofreAddress>                    # stdout
pnpm tsx scripts/compliance-export.ts <cofreAddress> --output file.csv  # file
```

**Implementação:**
- Lê `prisma.auditLink.findMany({ where: { cofreAddress } })`
- Para cada link, chama `exportAuditToCSV` de `packages/core/src/audit.ts`
- Concatena CSVs (1 header global, dedupe entre scopes)
- stdout ou ficheiro conforme flag
- Exit 0 success, exit 1 erro (sem prompts interativos)

### `scripts/deploy-gatekeeper.ts` — wrapper fino

**Uso:**

```bash
pnpm tsx scripts/deploy-gatekeeper.ts --cluster devnet
```

**Passos:**
1. Validar `--cluster` ∈ {`devnet`, `localnet`} (mainnet bloqueado nesta spec)
2. Validar `ANCHOR_WALLET` env existe e ficheiro readable
3. **Confirmação interativa:** print "Deploying cloak_gatekeeper to {cluster}. Continue? (y/N)" — exit se não-y (evita deploy acidental)
4. `anchor build -p cloak_gatekeeper` — spawn child_process, pipe stdout
5. `anchor deploy --provider.cluster <cluster> -p cloak_gatekeeper`
6. Verificar: `connection.getAccountInfo(GATEKEEPER_PROGRAM_ID)` retorna account com `executable=true`
7. Log final: program ID, slot, tx signature, custo SOL

**Exit:** 1 se qualquer passo falhar; 0 com summary se ok.

### `scripts/deploy-cloak-mock.ts` — idêntico a `deploy-gatekeeper.ts`

**Diferenças:**
- Trocar `cloak_gatekeeper` por `cloak_mock`
- Trocar program ID
- Bloquear `--cluster mainnet` com exit 1 imediato (mock é devnet-only por definição)

### Comandos novos no `package.json` raiz

```jsonc
{
  "scripts": {
    "seed:demo": "tsx scripts/seed-test-data.ts",
    "seed:reset": "tsx scripts/seed-test-data.ts --reset",
    "audit:export": "tsx scripts/compliance-export.ts",
    "deploy:gk": "tsx scripts/deploy-gatekeeper.ts",
    "deploy:mock": "tsx scripts/deploy-cloak-mock.ts"
  }
}
```

### Bloco 3.5 — `packages/core/src/cloak-deposit.ts` (wrapper `cloakDeposit()`)

**Por que está aqui (e não no Bloco 5):** o snippet é endossado pela equipa Cloak e usa apenas funções já exportadas do SDK (`transact`, `createUtxo`, `createZeroUtxo`, `generateUtxoKeypair`, `CLOAK_PROGRAM_ID`, `NATIVE_SOL_MINT`). Adicioná-lo agora é zero-risco (não toca produto), e é necessário para `tests/devnet/cloak-deposit.devnet.test.ts` (Bloco 2.4).

**Verificação prévia:** grep confirmou que `sdk.deposit()` NÃO é usado em código de produto (`apps/web/`, `packages/core/`). Único call site: `scripts/spike-cloak-devnet.ts:29` — script de research, sem dependentes. Adicionar o wrapper agora não desfaz nada.

**Conteúdo:** transcrição literal do snippet fornecido pela Cloak team (com tipagem TS estrita, JSDoc, e tratamento de erro). Assina:

```ts
export async function cloakDeposit(
  connection: Connection,
  payer: Keypair,
  amount: bigint,
  mint?: PublicKey,  // default: NATIVE_SOL_MINT
): Promise<{
  signature: string;
  leafIndex: number;
  spendKeyHex: string;
  blindingHex: string;
  amount: bigint;
  mint: PublicKey;
}>
```

**Export via `packages/core/src/index.ts`:** adicionar `export { cloakDeposit } from "./cloak-deposit";`.

**Não usar em produto agora.** Ficheiro existe para o Bloco 5 consumir e para o `tests/devnet/` validar contra Cloak real. Operator/send pages continuam a usar mock até o Bloco 5.

---

## Deploy Radar — 3 docs

### `docs/DEVNET_DEMO_READY.md`

Checklist operacional para garantir que a demo é estável em devnet. Não bloqueia código; é runbook.

**Categorias:**
- **Env vars** — todas as 11 de `apps/web/lib/env.ts` preenchidas
- **RPC** — usar Helius/QuickNode devnet, não `api.devnet.solana.com` (rate limits)
- **Relay Cloak** — `https://api.devnet.cloak.ag` healthcheck antes do demo
- **DB** — `pnpm prisma migrate deploy` aplicada; `seed:demo` corrido
- **Program IDs** — verificar `Anchor.toml [programs.devnet]` aponta para deploys atuais
- **Monitorização** — `console.error` paths revistos
- **Devnet reset** — procedimento se Solana resetar devnet: `pnpm seed:reset` + redeploy gatekeeper se necessário
- **Mock USDC mint** — `DEVNET_MOCK_USDC_MINT` exportado pelo Cloak SDK; disponível para futuras features de swap

### `docs/CLOAK_MOCK_REMOVAL.md`

Runbook completo do **Bloco 5 futuro** (não executar agora). Conteúdo:

- **Por quê:** mock é stub bookkeeping; não testa privacidade real do Cloak
- **Mecanismo de deposit endossado pela Cloak team:** wrapper `cloakDeposit()` em `packages/core/src/cloak-deposit.ts` (Bloco 3.5). Snippet baseado no código vivo de `devnet.cloak.ag` (`devnet/web/hooks/use-cloak-sdk.ts:611`). Chamar `transact()` (disc-0) diretamente. **NÃO usar `sdk.deposit()` até Cloak corrigir o bug do disc-1.**
- **Por quê Option B (não C):** account layouts e discriminators do Cloak real não são publicamente documentados (per `docs.cloak.ag/development/devnet`); `buildTransactInstruction` não é exportada no SDK; CPI direto gatekeeper→Cloak é inviável sem reverse-engineering
- **Mudanças Rust** (`programs/cloak-gatekeeper/src/instructions/execute_with_license.rs`):
  - Remover const `CLOAK_PROGRAM_ID` + `#[cfg]`
  - Remover função `build_stub_transact_data`
  - Remover bloco `Instruction { ... }` + `invoke(&ix, ...)?`
  - Da struct `ExecuteWithLicense`: remover `cloak_program`, `cloak_pool`, `nullifier_record`
  - Remover parâmetros `proof_bytes`, `merkle_root` do `handler`
  - Manter: validação operator + license + payload_hash + `license.status = Consumed` + `emit!(LicenseConsumed)`
- **Mudanças TypeScript** (9 ficheiros — ver tabela completa em `cloak-real-integration-analysis.md` Parte 4)
- **Workspace cleanup:**
  - `Anchor.toml` — remover `cloak_mock` de `[programs.localnet]` e `[programs.devnet]`
  - `Cargo.toml` — remover `"programs/cloak-mock"` de `members`
  - `programs/cloak-mock/` — deletar diretório
- **Sequência de redeploy:**
  1. Branch `feat/remove-cloak-mock`
  2. Implementar Rust + TS
  3. `pnpm test:int` passa com nova shape
  4. `anchor build -p cloak_gatekeeper`
  5. `anchor deploy --provider.cluster devnet -p cloak_gatekeeper` (upgrade in-place; requer upgrade authority)
  6. `pnpm seed:reset` (cofres existentes ficam órfãos pela mudança de struct)
  7. `solana program close <CLOAK_MOCK_PROGRAM_ID> --bypass-warning` (recuperar SOL — opcional)
  8. `anchor idl upgrade` para o gatekeeper
- **Risco principal:** breaking change. Frontend e Rust deployados na mesma janela. Frontend antigo a chamar `executeWithLicense` com a struct velha falha.

### `docs/TECH_DEBT.md`

Itens não-bloqueantes. Sem prioridade implícita; cada item tem `Severidade: low|medium|high`.

**TODOs descobertos no código (5):**
- `api/audit/[linkId]/revoke/route.ts:51` — call `revoke_audit` on-chain (em curso pelo user, Bloco 4.3) — **medium**
- `api/audit-links/route.ts:69` — verify signature against message — **high** (auditor pode forjar links)
- `audit/[linkId]/page.tsx:103` — fetch real txs from Cloak scan via viewKey — **medium**
- `cofre/[multisig]/audit/page.tsx:169` — fetch + export real tx data — **medium**
- `claim/[stealthId]/page.tsx:155,163` — integrar `fullWithdraw` real + atualizar status pós-claim — **high**

**Refactors:**
- `apps/web/lib/squads-sdk.ts:8` — `IS_DEV` flag pode ser removida
- `scripts/spike-*.ts` e `probe-*.ts` — mover para `scripts/research/` (não são scripts de produto)
- `scripts/spike-cloak-devnet.ts` — **deletar** (usa `sdk.deposit()` quebrado; substituído por `cloakDeposit()` wrapper. Manter histórico em git.)
- `docs/devnet-blocker.md`, `docs/spike-findings.md` — consolidar em `docs/research/`
- `docs/cloak-discord-report.md` — atualizar `Update log` com a resposta da Cloak team (snippet `cloakDeposit()` recebido, workaround endossado)

**Observabilidade:**
- Zero coverage report; adicionar `vitest --coverage` ou `c8`
- Sem structured logging; usar `pino` ou similar
- Sem métricas; considerar Sentry/Datadog para `console.error` paths

**Expansão futura (não-débito, ideias):**
- Swap SOL → mock USDC em devnet usa `swapWithChange` do SDK (não exposto na UI)
- `getNkFromUtxoPrivateKey` permite derivar viewing keys server-side se quisermos rotação

---

## Ordem de execução

```
Branch: feat/blocos-2-3-radar (single branch, single PR contra master)

Sequencial:
  0. Adicionar vitest como devDep (pré-requisito para Bloco 2.1)
  1. Bloco 3.1 — scripts/seed-test-data.ts (idempotente + --reset + check on-chain)
  2. Bloco 3.2 — scripts/compliance-export.ts
  3. Bloco 3.3 — scripts/deploy-gatekeeper.ts
  4. Bloco 3.4 — scripts/deploy-cloak-mock.ts
  5. Bloco 3.5 — packages/core/src/cloak-deposit.ts (wrapper) + export em index.ts
  6. Bloco 2.1 — tests/unit/f4-stealth.test.ts
  7. Bloco 2.2 — tests/integration/f3-audit.test.ts
  8. Bloco 2.3 — tests/integration/e2e-full-flow.test.ts
  9. Bloco 2.4 — tests/devnet/cloak-deposit.devnet.test.ts (opcional, usa Bloco 3.5)
 10. docs/DEVNET_DEMO_READY.md
 11. docs/CLOAK_MOCK_REMOVAL.md
 12. docs/TECH_DEBT.md
 13. package.json scripts: test:unit, test:devnet, test:all, seed:demo, seed:reset, audit:export, deploy:gk, deploy:mock
 14. Verificação final: pnpm test:all + pnpm typecheck:all + biome check
```

**Razão da ordem:**
- Scripts antes dos testes — `seed-test-data.ts` é útil para debugging manual dos testes
- Unit antes de bankrun — feedback mais rápido, isola F4
- e2e por último (mais lento, depende de F3 verde)
- Docs por último — capturam estado real após implementação

## Critério de "done"

- [ ] `pnpm test:int` passa (4 ficheiros bankrun: f1, f2, f3, e2e + os 2 existentes)
- [ ] `pnpm test:unit` passa (1 ficheiro: f4-stealth)
- [ ] `pnpm test:all` agrega int + unit
- [ ] `pnpm seed:demo` corre limpo num DB fresh; idempotente em segunda execução
- [ ] `pnpm seed:reset` apaga e regenera tudo
- [ ] `pnpm audit:export <cofre>` produz CSV válido
- [ ] `pnpm deploy:gk --cluster devnet` exige confirmação interativa antes de deployar
- [ ] `pnpm deploy:mock --cluster mainnet` falha imediato com erro
- [ ] 3 docs commitados em `docs/`
- [ ] PR único contra `master` com title `feat: blocos 2-3 + deploy radar`
- [ ] `packages/core/src/cloak-deposit.ts` exportado e testado em devnet (Bloco 3.5)
- [ ] Nenhum call site de `sdk.deposit()` no código (verificado por grep — atualmente só `scripts/spike-cloak-devnet.ts`, que é deletado em TECH_DEBT)

## Dependências externas / premissas

- `vitest` adicionado como devDep
- `@cloak.dev/sdk-devnet` já instalado (versão `0.1.5-devnet.0`)
- Cofre demo em devnet existe (via `pnpm demo:setup`) — pré-condição para `tests/devnet/`
- `https://api.devnet.cloak.ag` acessível (relay healthcheck)
- Solana devnet ativo no momento da execução
