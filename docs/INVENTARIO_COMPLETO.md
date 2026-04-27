# Inventario Completo — Tudo que Falta Fazer

**Data:** 2026-04-27
**Hackathon:** Cloak Track (Superteam Earn) — deadline 2026-05-14
**Baseado em:** investigação completa do codebase (packages, apps, programs, scripts, tests, docs)

---

## A. Plano Blocos 2+3 + Deploy Radar (14 tasks — já planejado)

**Ficheiro:** `docs/superpowers/plans/2026-04-27-blocos-2-3-radar.md`
**Status:** NÃO EXECUTADO

| # | Task | Ficheiro | Tipo |
|---|------|----------|------|
| 0 | Instalar vitest como devDep | `package.json` | setup |
| 1 | Seed idempotente DB + on-chain | `scripts/seed-test-data.ts` | Bloco 3.1 |
| 2 | Compliance export CLI (CSV) | `scripts/compliance-export.ts` | Bloco 3.2 |
| 3 | Deploy gatekeeper wrapper | `scripts/deploy-gatekeeper.ts` | Bloco 3.3 |
| 4 | Deploy cloak-mock wrapper | `scripts/deploy-cloak-mock.ts` | Bloco 3.4 |
| 5 | Wrapper `cloakDeposit()` endossado | `packages/core/src/cloak-deposit.ts` + `index.ts` | Bloco 3.5 |
| 6 | Testes unit stealth crypto (vitest) | `tests/unit/f4-stealth.test.ts` + `vitest.config.ts` | Bloco 2.1 |
| 7 | Testes audit scoped keys + CSV (node:test) | `tests/integration/f3-audit.test.ts` | Bloco 2.2 |
| 8 | E2E full flow scaffold (bankrun) | `tests/integration/e2e-full-flow.test.ts` | Bloco 2.3 |
| 9 | Devnet live test gated | `tests/devnet/cloak-deposit.devnet.test.ts` | Bloco 2.4 |
| 10 | Demo readiness checklist | `docs/DEVNET_DEMO_READY.md` | deploy radar |
| 11 | Runbook remoção cloak-mock (Bloco 5) | `docs/CLOAK_MOCK_REMOVAL.md` | deploy radar |
| 12 | Inventário tech debt | `docs/TECH_DEBT.md` | deploy radar |
| 13 | Wire scripts no package.json | `package.json` | wiring |
| 14 | Verificação final (typecheck + lint + test + build) | — | QA |

---

## B. BUGS / GAPS DE PRODUTO

### B1. Verificar assinatura em audit-links — HIGH

**Ficheiro:** `apps/web/app/api/audit-links/route.ts:69`

```ts
// TODO: Verify signature against message
```

**Problema:** Qualquer pessoa pode criar audit links em nome de qualquer signer. O `signature` é recebido mas nunca verificado. O mensagem esperada é `"create-audit-link:${cofreAddress}:${scope}:${expiresAt}:${issuedBy}"`.

**Fix:** Usar `nacl.sign.detached.verify(message, signature, publicKey)` para verificar que o signer realmente assinou a mensagem.

---

### B2. Claim stealth é cosmético — HIGH

**Ficheiro:** `apps/web/app/claim/[stealthId]/page.tsx:155`

```ts
// TODO: Integrate with real fullWithdraw instruction
await new Promise((resolve) => setTimeout(resolve, 1500)); // SIMULAÇÃO
```

**Problema:** O claim de stealth invoice faz um `setTimeout` de 1.5s e muda o estado visualmente. Nada acontece on-chain. O utilizador pensa que reclamou fundos mas não aconteceu nada.

**Fix:** Integrar com instrução `fullWithdraw` do Cloak SDK ou, no mínimo, chamar a API para atualizar status (B3).

---

### B3. Status pós-claim não persiste — HIGH

**Ficheiro:** `apps/web/app/claim/[stealthId]/page.tsx:163`

```ts
// TODO: After successful on-chain claim, update status via API
// await fetch(`/api/stealth/${invoice.id}/claim`, { method: "POST" });
```

**Problema:** Sem isso, o invoice fica em `status: "pending"` no DB para sempre, mesmo após "claim". Próxima vez que alguém abrir o link, aparece como claimable de novo.

**Fix:** Criar `POST /api/stealth/[id]/claim` route que atualiza `status = "claimed"` + `claimedAt` + `claimedBy`.

---

### B4. Audit page usa mock data — MEDIUM

**Ficheiro:** `apps/web/app/audit/[linkId]/page.tsx:104`

```ts
// TODO: Fetch actual transactions from Cloak scan using viewKey
const mockData = generateDeterministicMockData(metadata.id, 8);
```

**Problema:** A página de auditoria mostra dados mock determinísticos em vez de transações reais do Cloak scan. A view key é derivada mas nunca usada para buscar dados.

**Fix:** Integrar com Cloak scan API (quando disponível) ou relay para buscar transações reais usando a view key derivada.

---

### B5. Operator usa mock proofs — MEDIUM

**Ficheiro:** `apps/web/app/cofre/[multisig]/operator/page.tsx:172`

```ts
// TODO: Replace mock proofs with real ZK proofs before mainnet.
const proofBytes: new Uint8Array(256).fill(0), // MOCK
const merkleRoot: new Uint8Array(32).fill(0),  // MOCK
```

**Problema:** O operator manda 256 zero bytes como "prova ZK". O cloak-mock aceita sem verificar. Em produção o Cloak real rejeitaria.

**Fix:** Com o Bloco 5 (Option A), o deposit real acontece via `transact()` separadamente. O mock proof no gatekeeper torna-se irrelevante — o CPI mock é só bookkeeping.

---

## C. INTEGRAÇÃO REAL CLOAK — Option A

**Referência:** `docs/cloak-real-integration-analysis.md`
**Recomendação:** Option A (zero Rust changes, `transact()` em tx separada)

### C1. Wire cloakDeposit() no operator page

**Ficheiro:** `apps/web/app/cofre/[multisig]/operator/page.tsx`

**Mudança:** Antes de chamar `execute_with_license` (que CPIa mock), o operator chama `cloakDeposit()` para fazer o deposit real no Cloak devnet. Fluxo:

```
1. operator clica "Execute"
2. chama cloakDeposit(connection, payer, amount) → tx separada → deposit real
3. chama execute_with_license → CPI mock (bookkeeping) → license Consumed
4. UI mostra sucesso
```

### C2. Wire cloakDeposit() no send page

**Ficheiro:** `apps/web/app/cofre/[multisig]/send/page.tsx`

**Mudança:** No fluxo de envio, após criar a proposal e ser aprovada, o deposit real acontece via `transact()` em vez de só mock.

### C3. Migrar commitment scheme

**Ficheiro:** `apps/web/lib/init-commitment.ts` + todo o fluxo de propose/execute

**Problema:** O app usa `computeCommitment(amount, r, sk_spend)` (legacy). O Cloak real usa `computeUtxoCommitment({ amount, keypair, blinding, mintAddress })`. Produzem valores DIFERENTES para os mesmos inputs.

**Verificação:** `docs/cloak-real-integration-analysis.md:361-371` confirma que a migração é obrigatória.

**Mudança:**
- `init-commitment.ts`: trocar import de `computeCommitment` para `computeUtxoCommitment`
- Fluxo de propose: gerar `keypair` + `blinding` em vez de `r` + `sk_spend`
- Fluxo de execute: reconstruir commitment via UTXO scheme
- sessionStorage: persistir formato novo (`keypair`, `blinding`, `mint`)

### C4. Atualizar f1-e2e-devnet.ts

**Ficheiro:** `scripts/f1-e2e-devnet.ts`

**Mudança:** Substituir mock pool init + mock execute por `cloakDeposit()` + real Cloak PDAs.

---

## D. DOCS DESATUALIZADOS

### D1. ARCHITECTURE.md — models desatualizados

**Ficheiro:** `docs/ARCHITECTURE.md:153-154`

Diz:
```
| `AuditLink` | Audit admin diversifier records | Not yet built (F3) |
| `StealthInvoice` | Stealth invoice metadata | Not yet built (F4) |
```

**Realidade:** F3 e F4 estão implementados. AuditLink tem API routes (`api/audit-links/`, `api/audit/[linkId]/`). StealthInvoice tem API routes (`api/stealth/`).

**Fix:** Atualizar tabela para "Built" + link para rotas.

### D2. SECURITY.md — rate limiting

**Ficheiro:** `docs/SECURITY.md:76`

Diz:
```
4. **No rate limiting** — API routes have no rate limiting.
```

**Realidade:** Rate limiting foi adicionado em `apps/web/lib/rate-limit.ts` e aplicado em `api/proposals/route.ts`, `api/audit-links/route.ts`, `api/stealth/route.ts`. Commit: `699927e`.

**Fix:** Remover item da lista de limitações.

### D3. SECURITY.md — hardcoded CPI target

**Ficheiro:** `docs/SECURITY.md:74`

Diz:
```
2. **Hardcoded CPI target** — `CLOAK_MOCK_PROGRAM_ID` is hardcoded.
```

**Realidade:** Cargo feature flag adicionada em `f1aa4ff`. `CLOAK_PROGRAM_ID` é configurável via `#[cfg(feature = "mainnet")]`.

**Fix:** Atualizar para "Configurable via Cargo feature flag (mainnet vs devnet)".

### D4. SECURITY.md — checklist unchecked

**Ficheiro:** `docs/SECURITY.md:82-85`

```
- [ ] Add rate limiting on API routes          ← FEITO
- [ ] Make CPI target configurable             ← FEITO
- [ ] Add `ARCHITECTURE.md` and `SECURITY.md`  ← FEITO
```

**Fix:** Marcar como `[x]`.

### D5. cloak-discord-report.md — Update log

**Ficheiro:** `docs/cloak-discord-report.md:205-208`

```
## Update log
- **2026-04-26** — initial report compiled.
```

**Realidade:** Cloak team respondeu (marcelofeitoza) confirmando o bug e fornecendo workaround (`transact()` direto). Snippet endossado incorporado na spec.

**Fix:** Adicionar entrada:
```
- **2026-04-27** — Cloak team (marcelofeitoza) confirmed bug. sdk.deposit() uses retired disc-1. Workaround: call transact() directly. Snippet endorsed and incorporated into packages/core/src/cloak-deposit.ts.
```

### D6. devnet-blocker.md — workaround desatualizado

**Ficheiro:** `docs/devnet-blocker.md:63-72`

Diz:
```
Continue using `cloak-mock` on devnet.
When the SDK is fixed (or we decide to integrate `transact()` standalone manually), swap...
```

**Realidade:** Cloak team endossou o workaround `transact()`. Wrapper `cloakDeposit()` criado. Live devnet test confirmou que funciona (`YMeL2tGF...`).

**Fix:** Atualizar seção Workaround com link para `packages/core/src/cloak-deposit.ts` e `docs/cloak-real-integration-analysis.md`.

---

## E. CLEANUP

| # | O quê | Ficheiro | Severidade |
|---|-------|----------|------------|
| E1 | Deletar `scripts/spike-cloak-devnet.ts` (usa `sdk.deposit()` quebrado, substituído por `cloakDeposit()`) | `scripts/spike-cloak-devnet.ts` | low |
| E2 | Mover spike/probe scripts para `scripts/research/` | `scripts/spike-*.ts`, `scripts/probe-*.ts` | low |
| E3 | Mover `find-existing-multisigs.ts` para `scripts/research/` | `scripts/find-existing-multisigs.ts` | low |
| E4 | Consolidar `docs/devnet-blocker.md` + `docs/spike-findings.md` em `docs/research/` | docs | low |

---

## F. BLOCO 5 FUTURO (fora de escopo agora)

**Documentado em:** `docs/CLOAK_MOCK_REMOVAL.md` (será criado na Task 11 do plano)

- Remover `programs/cloak-mock/` inteiro
- Remover CPI do gatekeeper Rust (`execute_with_license.rs` — ~50 linhas)
- Remover `cloak_mock` de `Anchor.toml` e `Cargo.toml`
- Atualizar 10+ ficheiros TS (ver tabela em CLOAK_MOCK_REMOVAL.md)
- Real ZK proofs no operator
- Breaking change: Rust + frontend deployados na mesma janela

---

## G. COMUNICAÇÃO

| # | O quê | Status |
|---|-------|------|
| G1 | Responder ao marcelofeitoza no Discord — confirmar se workaround funciona | PENDENTE — precisa implementar Task 5 + Task 9 do plano primeiro |

---

## Priorização para o Hackathon (deadline 2026-05-14)

### Fase 1 — Fundação (plano atual)
1. Executar plano Blocos 2+3 (tasks 0-14)

### Fase 2 — Integração real Cloak (diferencial do demo)
2. C3 — migrar commitment scheme (pré-requisito)
3. C1 — wire cloakDeposit() no operator
4. C2 — wire cloakDeposit() no send

### Fase 3 — Security + Polish
5. B1 — verificar assinatura audit-links
6. B3 — criar API route de claim
7. D1-D6 — atualizar docs desatualizados

### Fase 4 — Nice-to-have
8. B2 — claim real on-chain
9. B4 — audit data real do Cloak scan
10. E1-E4 — cleanup de scripts
11. G1 — responder marcelofeitoza com resultado concreto
