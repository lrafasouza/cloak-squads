# Relatório de Investigação — Aegis

**Data:** 2026-04-27
**Status:** PARCIAL (interrompido)
**Branch:** master (109 commits à frente do origin/master)

---

## 🚨 Bloqueadores (P0 — corrigir antes de qualquer coisa)

### B1. Erro de sintaxe em `operator/page.tsx` (impede `tsc`/`next build`)
- **Arquivo:** `apps/web/app/cofre/[multisig]/operator/page.tsx:278`
- **Problema:** chave `}` extra fecha a função `executeSingle` prematuramente.
- **Sintoma:** `pnpm typecheck:all` falha com `TS1128: Declaration or statement expected` em `(714,1)`.
- **Introduzido em:** commit `daa39d1` (feat: integrate real Cloak SDK).
- **Trecho:**
  ```ts
  // ...
  276:      }
  277:    }       // fecha if (doCloakDeposit)
  278:    }       // ← STRAY: fecha a função executeSingle
  279:
  280:    const cloakProgram = new PublicKey(...)  // já fora da função
  ```
- **Fix:** remover a linha 278.

### B2. `hexToBytes` não definido em `send/page.tsx` (crash em runtime)
- **Arquivo:** `apps/web/app/cofre/[multisig]/send/page.tsx:90`
- **Problema:** chama `hexToBytes(commitment)` mas a função nunca é importada nem definida nesse arquivo. Está definida em `payroll/page.tsx:34`, então provavelmente foi esquecida durante o copy/paste.
- **Sintoma:** `ReferenceError: hexToBytes is not defined` no momento que o usuário clica "Create proposal".
- **Fix:** declarar `hexToBytes` localmente no `send/page.tsx` (mesma assinatura do `payroll/page.tsx`) ou extrair para `apps/web/lib/utils.ts` e importar nos dois.

### B3. `VersionedTransaction` referenciado mas não importado em `operator/page.tsx`
- **Arquivo:** `apps/web/app/cofre/[multisig]/operator/page.tsx:74`
- **Problema:** o type da função `cloakDepositBrowser` referencia `VersionedTransaction` mas só `Transaction` está importado de `@solana/web3.js` (linha 21).
- **Fix:** adicionar `VersionedTransaction` ao import existente.

---

## 🔴 Segurança crítica

### S1. `PATCH /api/stealth/[id]/utxo` sem autenticação nem validação
- **Arquivo:** `apps/web/app/api/stealth/[id]/utxo/route.ts`
- **Problema:**
  - Sem rate limit
  - Sem schema Zod
  - Sem verificação de assinatura/dono
  - Aceita qualquer body e sobrescreve `utxoPrivateKey` (chave de gasto da UTXO) no DB
- **Impacto:** quem souber o `id` da invoice pode trocar a chave privada da UTXO armazenada, redirecionando o "claim" para outra UTXO sob seu controle. Possível loss-of-funds.
- **Fix sugerido:**
  - Schema Zod estrito (mesmo padrão do `/api/proposals`).
  - Permitir PATCH **apenas se** `utxoPrivateKey` ainda é `null` (campos UTXO devem ser write-once).
  - Verificar assinatura do operator wallet sobre `(invoiceId, utxoCommitment)` antes de aceitar.
  - Aplicar `checkRateLimit(ip)` como nas demais rotas.

### S2. `POST /api/stealth/[id]/claim` sem autenticação nem assinatura
- **Arquivo:** `apps/web/app/api/stealth/[id]/claim/route.ts`
- **Problema:** qualquer um com o `id` pode chamar `POST` com `claimedBy: "<qualquer string>"` e marcar a invoice como `claimed` no DB. Sem rate limit. Sem validação que `claimedBy` é uma PublicKey válida. Sem verificação de assinatura. Sem verificação de que o claim on-chain de fato aconteceu (`fullWithdraw` no Cloak).
- **Impacto:** atacante consegue marcar invoices como reivindicadas sem fundos saírem on-chain → confunde dashboard, bloqueia o destinatário legítimo de tentar reivindicar via UI.
- **Fix sugerido:**
  - Receber `claimSignature` (tx hash do `fullWithdraw`).
  - Validar a tx on-chain (`connection.getTransaction(sig)`) e checar que a assinatura veio do `wallet.publicKey == claimedBy` e bate com `utxoCommitment`/`nullifier`.
  - Aplicar rate limit.

### S3. `rate-limit.ts` — divergência com SECURITY.md + memory leak
- **Arquivo:** `apps/web/lib/rate-limit.ts`
- **Problemas:**
  - Default é `limit = 10` req/min, mas `docs/SECURITY.md` afirma "60 requests/minute per IP" → documentação fora de sincronia.
  - O `Map` interno nunca evita entries vencidas (comentário admite "Entries are never evicted") → memory leak crescente em produção.
  - IP vem direto de `x-forwarded-for` sem ressalva sobre confiança no proxy → spoofável se Next.js estiver exposto sem proxy reverso bem configurado.
- **Fix:** alinhar default ao doc OU atualizar doc; adicionar varredura de eviction (`if (now > entry.reset) map.delete(key)`); documentar que precisa de proxy header trust.

### S4. Logs barulhentos em produção
- **Arquivo:** `apps/web/app/cofre/[multisig]/operator/page.tsx:107-108` e `claim/[stealthId]/page.tsx:204-205`
- **Problema:** callbacks `onProgress` e `onProofProgress` chamam `console.error` direto, sem o gate `IS_DEV` que `squads-sdk.ts` usa.
- **Fix:** envolver em check de NODE_ENV ou usar `pino` (já está nas deps).

---

## 🟡 UX / Routing / SessionStorage

### U1. `sessionStorage` perdido entre tabs do mesmo invoice
- `send/page.tsx:153` salva `claim:${cofre}:${txIndex}` em `sessionStorage` (escopo por aba).
- `proposals/[id]/page.tsx:99` lê do mesmo storage.
- **Risco:** se o aprovador abre o link em **outra aba** ou navega via histórico após reload, perde o claim → fluxo trava sem mensagem clara. (`/proposals/[id]` mostra "commitment unavailable" e segue como se não houvesse problema, mas o usuário ainda não tem como reidratar.)
- **Sugestão:** ou (a) compartilhar via `localStorage` com TTL + assinatura do membro, ou (b) deixar bem explícito na UI que claim só é resgatável na aba que criou. Hoje o fallback silencioso é confuso.

### U2. Dashboard "Shielded balance" mostra `--` permanentemente
- `cofre/[multisig]/page.tsx:177-182` — placeholder ainda escrito como "Cloak scan integration lands in the F1 operator flow", mas `HANDOFF.md` lista F1 como **DONE**. Texto e estado estão estagnados.
- **Sugestão:** integrar com `scanTransactions` quando `viewKey` estiver disponível, ou esconder o card até a feature existir.

### U3. Loading sem skeleton em rotas críticas
- `cofre/[multisig]/page.tsx`, `proposals/[id]/page.tsx`, `claim/[stealthId]/page.tsx` mostram apenas "Loading…" / "Loading invoice data...". Sem skeleton, sem feedback de progresso. Faz a app parecer travada por 1-3s em devnet.
- **Sugestão:** componentes de skeleton (já temos shadcn). Pequeno ganho de UX percebida.

### U4. Erros em `loadDrafts` engolidos silenciosamente
- `cofre/[multisig]/page.tsx:87` faz `catch { /* ignore */ }`. Em produção, falha de rede → dashboard fica vazio sem mensagem.
- **Sugestão:** setState de `error` e mostrar inline com botão "Retry".

### U5. `routing` — colisão semântica `[id]` vs `[cofre]`
- A rota `/api/stealth/[id]/route.ts` valida `id` como **cofre** PublicKey (linha 9), mas as subrotas (`[id]/claim`, `[id]/utxo`) tratam `id` como **invoice id**.
- O nome do segmento dinâmico é o mesmo (Next.js exige), mas o código carrega valores semanticamente diferentes pelo mesmo nome → fonte de bug futuro. O `git status` mostra que `[cofre]/route.ts` foi deletado e `[id]/route.ts` virou o substituto, sem refatoração do código que continua tratando como cofre.
- **Sugestão:** renomear o segmento para algo neutro tipo `[key]` e separar handlers (`/api/stealth/by-cofre/[cofre]` vs `/api/stealth/[id]`), ou ao menos comentar a convenção.

### U6. `/api/stealth/[id]` ignora cleanup do `[cofre]` antigo
- `git status` mostra `deleted: apps/web/app/api/stealth/[cofre]/route.ts` + `untracked: apps/web/app/api/stealth/[id]/route.ts` — refactor não commitado. **Operator/claim já apontam para `[id]`** — então funciona, mas o estado worktree está sujo. **Risco**: se outro dev fizer pull/checkout e tentar rodar, vai pegar versão sem essa rota e quebrar.

---

## 🟠 Performance Web (parcial — falta validar bundle)

### P1. Tudo é client component
- `app/page.tsx`, `app/layout.tsx → wrapped em WalletProviders + QueryProvider` (ambos `"use client"`).
- Como `WalletProviders` é client e está no root layout, **toda** a app é hidratada no cliente.
- **Mitigação:** mover providers para um `<ClientProviders>` que envolva apenas as rotas que precisam de wallet (`/cofre/*`, `/claim/*`). `/audit/[linkId]` e a home (lista de invoices) podem ser server components.
- **Ganho esperado:** redução considerável de JS inicial (`@solana/wallet-adapter-react-ui` + `@sqds/multisig` + `@cloak.dev/sdk-devnet` são pesados).

### P2. SDKs do Cloak importados estaticamente em página visível pra todos
- `send/page.tsx`, `payroll/page.tsx`, `operator/page.tsx`, `claim/[stealthId]/page.tsx` importam `@cloak.dev/sdk-devnet` no topo.
- O SDK carrega circuitos Groth16 — peso considerável.
- **Sugestão:** `dynamic(() => import(...), { ssr: false })` nas páginas que de fato chamam `transact()` / `fullWithdraw()` — ou import dinâmico apenas dentro do handler do submit.

### P3. `next.config.mjs` não revisado
- Arquivo existe (395 bytes) mas ainda não auditei. Suspeitas: ausência de `output: 'standalone'`, sem otimização de imagens, sem `experimental.optimizePackageImports` para `@solana/wallet-adapter-*`.

### P4. `framer-motion` na dep mas não vi uso ainda
- Pode ser dead-weight. Validar com `pnpm why framer-motion` e treeshaking real.

### P5. `react-query` com `staleTime: 15s` e `refetchOnWindowFocus: false`
- OK em devnet, mas em mainnet/produção pode mascarar updates de status de proposal/invoice. Considerar `staleTime` por query em vez de global.

---

## 🧪 Testes (em andamento — interrompido)

- `tests/integration/`: 6 suites (spike-cpi, gatekeeper-instructions, f1-send, f2-batch, f3-audit, e2e-full-flow). HANDOFF afirma que passam, mas **não consegui completar a corrida nesta sessão** — comando rodava em background quando o usuário interrompeu.
- `tests/unit/f4-stealth.test.ts` + `vitest.config.ts` existem, vitest está nas devDeps.
- `tests/devnet/cloak-deposit.devnet.test.ts` está modificado (uncommitted changes em `git status`).
- `pnpm test:int` chama `node --experimental-strip-types` direto nos arquivos `.ts` — depende de Node 24+. README/package.json não documenta versão mínima.

---

## 🗒️ Outras observações

- `package.json` mistura `vitest` em `devDependencies` mas o handoff anterior (`2b4eb7e`) afirma que foi substituído por `tsx`. Decidir: ou usa vitest pra unit e remove o experimento `tsx`, ou remove vitest. Está nos dois lugares.
- `apps/web/.env.local` está commitado/presente no worktree (580 bytes) — confirmar `.gitignore` cobre `.env*` apenas localmente; nunca deve ir pro git.
- `Cargo.lock` (461KB pnpm-lock.yaml também) commitado, OK para reprodutibilidade.
- README aponta program IDs e fluxo, mas **não menciona** os 3 bugs B1/B2/B3 — alguém clonando vai bater na cara.
- 109 commits unpushed em `master`. Risco se a máquina morrer.

---

## ✅ Pontos positivos verificados

- Validação Zod robusta em `/api/proposals` (PublicKey on-curve check, byte-length checks, BigInt range).
- Verificação de assinatura `nacl.sign.detached.verify` em `/api/audit-links` POST.
- Operator-gate on-chain bem documentado em `docs/SECURITY.md` com tabela de error codes.
- `sessionStorage` (não localStorage) para segredos — bom call.
- `IS_DEV` gate em `squads-sdk.ts` para logs.
- Compute budget instructions (1.4M CU + priority fee) já presentes em `operator/page.tsx`.
- Schema Prisma com `@@unique([cofreAddress, transactionIndex])` previne drafts duplicados.

---

## 📋 Próximos passos (quando retomarmos)

1. ✅ Corrigir B1, B2, B3 (são triviais, < 5 min).
2. ✅ Rodar `pnpm typecheck:all` e `pnpm test:int` limpo após fixes.
3. ✅ Endurecer `/api/stealth/[id]/claim` e `/utxo` (S1, S2).
4. ✅ Alinhar rate limit code ⇄ SECURITY.md (S3).
5. Rodar `pnpm -F web build` e medir bundle (`@next/bundle-analyzer`).
6. Avaliar splitting dos providers (P1).
7. Decidir `vitest` vs `tsx`.
8. Push dos 109 commits depois dos fixes.

---

**Comandos para retomar onde paramos:**
```bash
# Rodar testes (background processes não terminaram nesta sessão)
pnpm test:int 2>&1 | tee /tmp/int-tests.log
pnpm -F web build 2>&1 | tee /tmp/web-build.log

# Reproduzir o erro de typecheck
pnpm -F web exec tsc --noEmit
```
