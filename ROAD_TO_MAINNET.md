# Road to Mainnet — Aegis

**Branch de trabalho:** `road-to-mainnet`
**Branch protegida:** `master` (em produção, **NÃO TOCAR** — usuários reais testando)
**Estratégia:** fechar todos os blockers nesta branch. Merge para master é o **último** passo, e dispara auto-deploy em prod.
**Última revisão completa:** 2026-05-15 (ULTRA REVIEW)
**Score atual:** 62/100. Audit AI: 45/53 findings fechados (Passes 0–5).

---

## 0. Regras desta branch

1. Todo trabalho de hardening (Fases A–D abaixo) é commitado em `road-to-mainnet`.
2. **Não fazer merge em master** até Fase D liberar.
3. Toda mudança em env / boot / crypto exige smoke test local com `NODE_ENV=production` + env de prod simulado (lição aprendida 2026-05-08: `typecheck` + `vitest` não pegam crashes de boot).
4. Atualizar os checkboxes desta página conforme fechamos cada item. Este doc é a fonte da verdade do "o que falta".

---

## 1. Status macro

| Bucket | Score | Comentário |
|---|---:|---|
| Programa Anchor (correção) | 8.5/10 | M4 é o único gap. Resto sólido. |
| Crypto backend (4-key split) | 9/10 | smoke-jwt-split 20/20. |
| Auth (login + v2 wallet) | 9/10 | Endpoint-bound, nonce, replay impossível. |
| API rate-limit / public surfaces | 7.5/10 | Audit endpoints sem rate-limit por IP. |
| Cobertura de testes (libs novas) | 5/10 | memo-crypto, vault-income-sync, spending-limits = 0 testes. |
| Infra/Deploy (Render) | 4/10 | starter plan, single instance, sem `/health`, sem APM. |
| CI/CD | 9/10 | SHA-pinned, Dependabot weekly, gates duros. |
| Governance mainnet | 5/10 | Script pronto, **não rodado**. Branch protection idem. |
| Observability | 2/10 | Zero APM. Crash descoberto via customer report. |

---

## 2. Fase A — Pré-merge sanity (executar **antes** de qualquer merge futuro)

> Estes são gates operacionais. Mexer só quando estivermos prontos para liberar o merge final.
> Sem eles, o merge para master vai derrubar prod (boot-loop garantido).

- [ ] **A1. 4 env vars na Render dashboard** (`render.yaml:74,83,85,90` declaram `sync: false`, valores ainda não setados)
  - `AUDIT_EXPORT_SIGN_KEY` → precisa prefixo `passphrase:` ou `base64:` (Pass 2 F-103). Para preservar keypair existente: `node -e "console.log('passphrase:' + process.env.OLD)"`.
  - `REDIS_URL` → Upstash (free tier ok para começar).
  - `REDIS_TOKEN` → só se URL não trouxer token inline.
  - `APP_ORIGIN` → ex.: `https://aegisz.xyz` (usado pelo Report-To header — F-504).
  - **Done quando:** `curl https://aegisz.xyz/api/health` retorna 200 após redeploy manual.

- [ ] **A2. Branch protection em `master`** (recipe em `docs/security/governance.md:161-196`)
  - Comando único:
    ```bash
    gh api -X PUT repos/lrafasouza/Aegis/branches/master/protection \
      -F required_status_checks[strict]=true \
      -F 'required_status_checks[contexts][]=Unit Tests' \
      -F 'required_status_checks[contexts][]=Integration Tests (Anchor)' \
      -F 'required_status_checks[contexts][]=Rust Supply-Chain (cargo-audit)' \
      -F 'required_status_checks[contexts][]=Secret Scan (gitleaks)' \
      -F enforce_admins=true \
      -F required_pull_request_reviews[required_approving_review_count]=1 \
      -F allow_force_pushes=false \
      -F allow_deletions=false
    ```
  - **Done quando:** PR direto em master é rejeitado sem aprovação + checks verdes.

---

## 3. Fase B — Hardening na `road-to-mainnet` (código + testes)

> Ordem importa: **B1 e B2 vêm antes** de qualquer mudança que escale Render para multi-instance (Fase C9).

### Bloqueadores de mainnet

- [x] **B1. Redis-backed membership cache** ✅ 2026-05-15
  - `apps/web/lib/vault-membership.ts` reescrito com 3-níveis: in-memory (per-process fast path) → Redis Upstash REST (cross-pod canonical) → RPC fallback.
  - TTL 15s em ambos níveis. Read order: memory → redis → RPC; cada nível polui o anterior.
  - `invalidateMembershipCache(addr)` agora async: DEL Redis + delete local (broadcast cross-pod).
  - Failure-mode: Redis unreachable → warn-once + fall back para in-memory + RPC (mesma filosofia do `rate-limit.ts`). Nunca lockeia membros legítimos.
  - 1 caller atualizado (`/api/vaults/[multisig]/refresh-membership/route.ts`) com `await`.
  - TODO inline: extrair `lib/redis.ts` compartilhado entre rate-limit e membership numa futura refatoração.

- [x] **B2. `/api/health` endpoint + `healthCheckPath` no `render.yaml`** ✅ 2026-05-15
  - `apps/web/app/api/health/route.ts` — GET, force-dynamic, runtime Node.js. DB ping (`SELECT 1`) + Redis ping (`GET __health__` via Upstash REST) em paralelo com timeout 2s.
  - Retorna JSON: `{status, uptime_s, commit, checks: {db: {status, latency_ms, error?}, redis: {…}}}`. HTTP 200 se DB ok (Redis degraded é tolerável); 503 só se DB hard-fail.
  - `render.yaml`: `healthCheckPath: /api/health`.
  - Acceptance pendente: confirmar 200 após próximo deploy Render. `scripts/smoke-boot-prod.sh` valida local.

- [x] **B3. ADR M4 cross-vault witness** ✅ 2026-05-15 — `docs/security/adr-001-cross-vault-witness.md` escrito
  - Decisão: **Opção B** (accept + document operator-trust model) para o v1 mainnet. Opção A (source-vault co-signature) reaberta no próximo major do programa.
  - ADR documenta: contexto, opções, decisão + rationale, threat model aceito, 5 mitigações em vigor, action items, trigger conditions para reabrir.
  - Pendências derivadas: anotação `funding_vault_index` no audit-export (próximo sprint), referenciar ADR em `programs/cloak-gatekeeper/README.md`, sentença no onboarding do operator.

### Cobertura de testes (gap audit)

- [x] **B4. `packages/core/tests/memo-crypto.test.ts`** ✅ 2026-05-15 — 10 tests green
  - Cobertura: encrypt/decrypt round-trip, wrong key → null, tampered ciphertext/nonce → null, non-determinism, UTF-8 emoji+multibyte, empty string, serialize/deserialize round-trip + decrypt-after-JSON-transport.

- [x] **B5. `tests/unit/vault-income-sync.test.ts`** ✅ 2026-05-15 — 10 tests green
  - Reescopo: foquei nas 3 superfícies de maior leverage que não exigem fake RPC server.
  - Cobertura: early-exit em multisig inválido; throttle SQL race-protection (executeRaw=0 bloqueia fan-out RPC); `force=true` usa upsert direto; cluster scoping via `getCurrentCluster()` parametriza tanto o throttle quanto o read; `readVaultIncome` honra limit, ordena desc, mapeia rows preservando bigint-as-string sem perda de precisão.
  - RPC fan-out full + `inspectVaultIncomeSync` ficam para integration tests.

- [x] **B6. `tests/unit/spending-limits.test.ts`** ✅ 2026-05-15 — 10 tests green
  - Reescopo: o módulo é um wrapper fino do Squads SDK, não um policy engine. Foco no único path puro (`buildSpendingLimitUseIx`) e no risco real (precisão bigint→Number).
  - Cobertura: estrutura `TransactionInstruction` (programId/keys/data), guard `MAX_SAFE_INTEGER` (throw + boundary), zero amount, SOL vs SPL path (mint referenciada só em SPL), memo passthrough, binds de destination/member-signer/spendingLimit PDA, vaultIndex 0..127.

- [x] **B7. `packages/core/tests/payload-hash.test.ts`** ✅ 2026-05-15 — 11 tests green
  - Movido pra core (mais útil que só medir `crypto.getRandomValues`): testa a função real `computePayloadHash` que gera a seed da License PDA.
  - Cobertura: 32-byte digest, determinism, avalanche em nullifier/nonce/amount, **1000 random invariants → 1000 hashes únicos**, **1000 nonce-only variations → 1000 hashes únicos**, length validation × 4.

### Hardening menores (defense-in-depth)

- [x] **B8. Rate-limit em `/api/audit/[linkId]/transactions` e `/export`** ✅ 2026-05-15
  - `/transactions`: profile `"default"` (30/min). Key `audit:tx:${linkId}:${ip}`. Fail-fast antes do Prisma fetch + `loadAuditTransactions`.
  - `/export`: profile `"write"` (10/min). Key `audit:export:${linkId}:${ip}`. Mais apertado — CPU-heavy (`canonicalJson` + Ed25519 sign por request).
  - Ambos retornam 429 + `Retry-After: 60`.
  - Redis-backed em prod (env.ts força REDIS_URL); in-memory fallback em dev.

- [x] **B9. Sentry skeleton** ✅ 2026-05-15 (zero-overhead até DSN setado)
  - `apps/web/lib/sentry.ts` — wrapper com dynamic import de `@sentry/nextjs` + local type stub. No-op se `SENTRY_DSN` unset OU package não instalado.
  - `instrumentation.ts:register()` chama `initSentry()` após validação de env.
  - Schema env (`apps/web/lib/env.ts`) ganhou `SENTRY_DSN` (opcional URL) + `SENTRY_TRACES_SAMPLE_RATE`.
  - `render.yaml` + `render-mainnet.yaml` declaram ambas `sync: false`.
  - Helpers exportados: `initSentry()`, `captureException(err)`, `captureMessage(msg, level)`.
  - **Para ativar:** (1) criar conta Sentry, copiar DSN; (2) `pnpm -F web add @sentry/nextjs`; (3) setar `SENTRY_DSN` no Render. Próximo deploy loga `[sentry] initialized`.

- [x] **B10. Defense-in-depth no Rust: `vault_index == 0`** ✅ 2026-05-15
  - `revoke_audit` JÁ estava hardcoded em vault[0] (linha 14). Sem mudança necessária.
  - `emergency_close_license`: adicionado `require!(vault_index == 0, AdminMustUsePrimaryVault)` antes do `verify_squads_vault_signer`. Novo error variant `AdminMustUsePrimaryVault` (code 6014) em `errors.rs`. IDL JSON atualizado manualmente.
  - Regression test em `gatekeeper-instructions.test.ts`: tx com `vaultIndex: 1` → falha com `AdminMustUsePrimaryVault`; license preservada.
  - **Pendente:** `anchor build --verifiable` (precisa `cargo-build-sbf` na máquina) + redeploy devnet via Squads 2-of-2 → fica para Fase C5 (junto do deploy mainnet).

- [ ] **B11. CSP enforce flip** (P4-F-401 deferred — aguardar telemetria de 1 semana pós-A1)
  - Substituir `'unsafe-inline'` por nonce per-request em `next.config.mjs`.
  - Narrow `connect-src` a partir do que o `/api/csp-report` coletar.
  - **Dependência:** APP_ORIGIN setado (A1) + 7 dias de coleta.
  - Estimativa: 4h.

- [x] **B12. `scripts/smoke-boot-prod.sh`** ✅ 2026-05-15
  - Carrega `apps/web/.env.prod-like` (gitignored), roda `pnpm build` + `pnpm start` (standalone server, **mesmo path do Render**, não `next start`), hits `/api/health` e `/`.
  - Modo `--negative`: deliberadamente remove `SESSION_HMAC_KEY`, confirma que `instrumentation.ts` faz `process.exit(1)` em ~8s (sentinel pro próximo bug 2026-05-08 não escapar).
  - Modo `--skip-build`: reutiliza `.next/` existente.
  - Acompanha `apps/web/.env.prod-like.example` (template gitignorable, todos os keys obrigatórios por `env.ts:superRefine`).
  - Pendência: depende de B2 para o path `/api/health` retornar 200 (script já aceita override via `SMOKE_HEALTH_PATH`).

---

## 4. Fase C — Mainnet operacional (dia do switch)

> Sequência rígida. Não embaralhar. Cada passo desbloqueia o próximo.

- [ ] **C1. Provisionar Ledger hardware** + capturar pubkey
  - Comprar Ledger Nano S+ ou X. Inicializar offline. Instalar app Solana.
  - Capturar `AEGIS_LEDGER_PUBKEY` (pubkey do account 0).
  - **Done quando:** pubkey salvo em Bitwarden (não em git).

- [ ] **C2. Rodar `scripts/setup-mainnet-governance.ts`**
  ```bash
  AEGIS_LEDGER_PUBKEY=<pubkey> \
  AEGIS_RPC=https://api.mainnet-beta.solana.com \
    pnpm tsx scripts/setup-mainnet-governance.ts
  ```
  - Script cria multisig 2-of-3 (hot + cold em-memory + Ledger), threshold 2, time-lock 24h.
  - Anota `VAULT_ADDRESS`, `MULTISIG_ADDRESS`, `LEDGER_MEMBER`.

- [ ] **C3. Backup cold key**
  - Script printa cold key UMA vez. Copiar para Bitwarden + paper backup em local seguro.
  - **Nunca** escrever em disco / commitar.

- [ ] **C4. `scripts/build-verifiable.sh`** — gera `.so` reprodutível
  - Tree limpa, anchor build --verifiable, sha256 + commit SHA.
  - Publicar em GitHub release.

- [ ] **C5. `anchor deploy --provider.cluster mainnet-beta`**
  - Wallet de deploy com ~5 SOL mainnet. Authority temporária = wallet de deploy.

- [ ] **C6. Migrar upgrade authority** para o vault PDA do C2
  ```bash
  solana program set-upgrade-authority <PROGRAM_ID> \
    --new-upgrade-authority <VAULT_PDA_DO_C2> \
    --keypair <DEPLOY_KEYPAIR> \
    --url https://api.mainnet-beta.solana.com
  ```

- [ ] **C7. Verificar authority**
  ```bash
  solana program show <PROGRAM_ID> --url mainnet-beta
  # Authority deve ser o VAULT_PDA do C2
  ```

- [x] **C8. `render-mainnet.yaml`** ✅ 2026-05-15 (prep, valores reais ainda placeholders)
  - Arquivo separado na raiz (não merge no `render.yaml`). Render service criado manualmente via "New Blueprint → render-mainnet.yaml".
  - Diferenças: `plan: standard` (vs starter), `numInstances: 2` (depende de B1 ✅), `autoDeploy: false` (deploy gated on verifiable build), DB separado `aegis-db-mainnet plan: standard`, cluster `mainnet-beta`, Cloak relay `https://api.cloak.ag` (no devnet).
  - **Placeholders ainda nos program IDs** (`REPLACE_WITH_MAINNET_…`): preenchidos no dia C5 (`anchor deploy --provider.cluster mainnet-beta`).
  - Header do arquivo lista o checklist completo Fase C como sanity antes de criar o blueprint.

- [ ] **C9. Upgrade Render plan** + multi-instance
  - `starter → standard` (~$25/mo)
  - `numInstances: 2` no render.yaml
  - `healthCheckPath: /api/health` (B2)
  - **Pré-requisito:** B1 fechado (Redis cache), senão multi-instance quebra membership.

- [ ] **C10. Smoke E2E em mainnet**
  - Issue license → execute_with_license → revoke_audit → audit export.
  - Criar cofre teste com 0.1 SOL. Validar fluxo completo antes de habilitar produção.

---

## 5. Fase D — Merge final (a última etapa)

> Só executar quando Fase B 100% verde e Fase C testada em paralelo.

- [ ] **D1. Conferência final**
  - Checkboxes B1–B12 todos marcados.
  - Checkboxes C1–C10 todos marcados.
  - Re-rodar `pnpm test:all` + `cargo audit` + `pnpm audit --audit-level=high --prod`.
  - Re-rodar `gitleaks detect` no histórico inteiro.

- [ ] **D2. Audit humano (recomendado, não bloqueante)**
  - FINAL.md §12 explicita: "human audit firm should be engaged for a second-pass review."
  - Sec3 / OtterSec / Neodyme: $15k–40k para o escopo deste programa.
  - Tempo: 2–4 semanas de janela.

- [ ] **D3. Pre-merge gates da Fase A**
  - Confirmar A1 (env vars) e A2 (branch protection).

- [ ] **D4. Merge `road-to-mainnet` → `master`**
  - Via PR (branch protection exige).
  - Squash ou merge commit — decidir conforme estilo do projeto.

- [ ] **D5. Acompanhar deploy automático no Render**
  - Logs limpos? `process.exit(1)` não disparou? `/api/health` responde?
  - Se boot-loop: rollback imediato via Render dashboard.

- [ ] **D6. Pós-launch (primeira semana)**
  - Monitorar `/api/csp-report` para informar B11.
  - Monitorar Sentry (B9) — top 5 erros por dia.
  - Engajar bug bounty (Immunefi ou self-hosted).
  - Postmortem semanal.

---

## 6. Ordem sugerida de execução (semana a semana)

| Semana | Foco | Itens |
|---|---|---|
| 1 | Testes faltando + decisão M4 | B4, B5, B6, B7, B3 |
| 1–2 | Infra hardening | B1, B2, B9, B10, B12 |
| 2 | Defense-in-depth API | B8 |
| 2–3 | Hardware governance | C1, C2, C3 |
| 3 | Deploy mainnet do programa | C4, C5, C6, C7 |
| 3 | Render mainnet variant | C8, C9 |
| 3 | Smoke E2E | C10 |
| 4 | CSP enforce (após telemetria) | B11 |
| 4 | Fase A + merge final | A1, A2, D1, D3, D4, D5 |
| 5+ | Pós-launch | D6 |

**Total realista:** 4 semanas com 1 dev focado, ou 2–3 semanas com 2 devs.

---

## 7. Pointers rápidos

- Audit final consolidado: `docs/security/reports/2026-05-13-FINAL.md`
- Pass reports individuais: `docs/security/reports/2026-05-{11,13}-*.md`
- Governance docs (mainnet flow + branch protection): `docs/security/governance.md`
- Mainnet governance script: `scripts/setup-mainnet-governance.ts`
- Verifiable build script: `scripts/build-verifiable.sh`
- Ultra Review 2026-05-15: nesta conversa do Claude Code; principais achados sumarizados acima.
