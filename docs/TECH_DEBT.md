# Tech Debt Inventory

> Inventário vivo de TODOs, refactors e observabilidade. Atualizar conforme o projeto evolui.

## Critical (resolver antes do hackathon)

| # | Item | Ficheiro(s) | Notas |
|---|---|---|---|
| C1 | Commitment scheme migration | `apps/web/lib/init-commitment.ts`, fluxo propose/execute | Migrar de `computeCommitment` legacy para `computeUtxoCommitment` do Cloak real. Pré-requisito para integração real (Bloco C). |
| C2 | Assinatura audit-links não verificada | `apps/web/app/api/audit-links/route.ts:69` | **FEITO** — verificação implementada com `nacl.sign.detached.verify`. |
| C3 | Claim stealth é cosmético | `apps/web/app/claim/[stealthId]/page.tsx:155` | `setTimeout` simula claim. Integrar `fullWithdraw` do Cloak SDK ou API de status. |
| C4 | Status pós-claim não persiste | `apps/web/app/claim/[stealthId]/page.tsx:163` | Criar `POST /api/stealth/[id]/claim` para atualizar DB. |

## High (pós-hackathon, antes de mainnet)

| # | Item | Ficheiro(s) | Notas |
|---|---|---|---|
| H1 | Remover cloak-mock inteiro | `programs/cloak-mock/`, CPI no gatekeeper | Runbook em `docs/CLOAK_MOCK_REMOVAL.md`. Breaking change: Rust + frontend na mesma janela. |
| H2 | Real ZK proofs no operator | `apps/web/app/cofre/[multisig]/operator/page.tsx:172` | Substituir mock proof (256 zero bytes) por proofs reais do Cloak SDK. |
| H3 | Audit data real do Cloak scan | `apps/web/app/audit/[linkId]/page.tsx:104` | Integrar API de scan com view key derivada em vez de mock data. |
| H4 | Rate limiting por endpoint | `apps/web/lib/rate-limit.ts` | Atualmente por IP global. Deveria ser por IP + endpoint. |
| H5 | Testes E2E completos | `tests/integration/e2e-full-flow.test.ts` | Scaffold existe. Expandir com issue + execute reais (copiar de f2-batch.test.ts). |

## Medium (nice-to-have)

| # | Item | Ficheiro(s) | Notas |
|---|---|---|---|
| M1 | Observabilidade / logging estruturado | — | Pino já está em dependencies. Não está a ser usado consistentemente. |
| M2 | Métricas de negócio | — | Contadores: nº de cofres, licenças emitidas, volume transacionado. |
| M3 | Healthcheck endpoint | `apps/web/app/api/health/route.ts` | Verificar DB + RPC + relay. |
| M4 | CI/CD pipeline | — | GitHub Actions: typecheck + lint + test + build. |
| M5 | Documentação API (OpenAPI) | — | Gerar a partir dos Zod schemas das routes. |
| M6 | Mobile responsiveness | `apps/web/app/cofre/[multisig]/page.tsx` | UI funciona em desktop. Mobile precisa de polimento. |

## Low (futuro)

| # | Item | Ficheiro(s) | Notas |
|---|---|---|---|
| L1 | Support SPL tokens além de SOL | — | `cloakDeposit()` já aceita `mint`. UI não expõe selector. |
| L2 | Batch deposits no Cloak | — | Múltiplos UTXOs numa só transação. |
| L3 | Stealth invoice com expiration automática | `apps/web/app/api/stealth/route.ts` | Cron job para marcar expired > 24h. |
| L4 | Analytics dashboard | — | Gráficos de volume, licenças, etc. |
| L5 | Multi-chain support | — | Avaliar outras chains com Cloak equivalent. |

## Observabilidade

### Logs esperados

- `[seed]` — `scripts/seed-test-data.ts`
- `[deploy-gk]` — `scripts/deploy-gatekeeper.ts`
- `[deploy-mock]` — `scripts/deploy-cloak-mock.ts`
- `[compliance-export]` — `scripts/compliance-export.ts`
- `[cloak]` — `packages/core/src/cloak-deposit.ts`
- `[api/*]` — routes Next.js

### Métricas sugeridas

| Métrica | Fonte | Alerta |
|---|---|---|
| `cofres_created_total` | gatekeeper events | — |
| `licenses_issued_total` | gatekeeper events | — |
| `licenses_consumed_total` | gatekeeper events | — |
| `relay_latency_ms` | `cloakDeposit()` | > 5s |
| `devnet_reset_detected` | `seed-test-data.ts` | immediate |

## Commits de referência

- `699927e` — rate limiting
- `f1aa4ff` — cargo feature flag para CPI target
- `YMeL2tGF...` — live devnet deposit via `transact()`
