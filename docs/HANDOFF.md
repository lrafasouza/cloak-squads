# Handoff — Cloak-Squads Implementation

**Data:** 2026-04-27 (sessão atual)  
**Status:** FASE 1 e FASE 2 completas. FASE 3 parcialmente completa.

---

## ✅ Estado Atual

### O que foi entregue nesta sessão

**FASE 1 — Integração Real Cloak (HIGH Priority)** ✅ COMPLETA

- **C3:** Commitment scheme migrado para UTXO
  - `packages/core/src/commitment.ts` — Tipos atualizados (backward compat)
  - `apps/web/lib/init-commitment.ts` — Usa `computeUtxoCommitment` + `createUtxo`
  - `apps/web/app/cofre/[multisig]/send/page.tsx` — Gera `keypair` + `blinding` via SDK
  - `apps/web/app/cofre/[multisig]/payroll/page.tsx` — Mesmo scheme UTXO para batch
  - APIs (`proposals` + `payrolls`) — Schemas Zod aceitam campos UTXO opcionais

- **C1:** `cloakDeposit()` wired no operator page
  - `apps/web/app/cofre/[multisig]/operator/page.tsx` — `cloakDepositBrowser()` com wallet adapter
  - Deposit real acontece antes de `execute_with_license`
  - UI mostra signature do Cloak deposit separadamente

- **C2:** Send page gera commitment correto (coberto pelo C3)

- **B3:** API route POST `/api/stealth/[id]/claim` criada
  - Persiste `status: "claimed"` no DB
  - `apps/web/app/claim/[stealthId]/page.tsx` — Chama API real

**FASE 2 — Code Review** ✅ COMPLETA

- Typecheck: `pnpm -F @cloak-squads/core exec tsc --noEmit` ✅
- Integration tests: `pnpm test:int` — 6 suites passando ✅
- Lint: Erros restantes são pré-existentes (non-null assertions, any em código antigo)

**FASE 3 — Medium Priority** 🔄 PARCIAL

- **B2:** Integrar claim real com `fullWithdraw` ✅ COMPLETO
  - Schema `StealthInvoice` atualizado com campos UTXO
  - API `PATCH /api/stealth/[id]/utxo` para guardar dados após deposit
  - `apps/web/app/claim/[stealthId]/page.tsx` — Usa `fullWithdraw()` do SDK
  - Operator page atualizado para chamar API de UTXO após deposit

- **B4:** Audit page estrutura para dados reais ✅ ESTRUTURA PRONTA
  - Estrutura pronta para integrar `scanTransactions` + `toComplianceReport`
  - Mock data ainda em uso (integração real requer `viewKey` derivation completa)

- **B5:** Operator com proofs reais 🔄 PENDENTE
  - Proofs são gerados pelo `transact()` do Cloak relay (já em uso)
  - Gatekeeper ainda usa mock proofs no CPI (não blocker para hackathon)

- **D1-D6:** Docs atualizados ✅ COMPLETO
  - `docs/ARCHITECTURE.md` — Models, fluxo, devnet integration atualizados
  - `docs/SECURITY.md` — Rate limiting, CPI target, checklist marcados como done
  - `docs/devnet-blocker.md` — Status: RESOLVED
  - `docs/cloak-discord-report.md` — Update log com resolução

---

## 🎯 Próximas Tarefas (se continuar)

### B5. Operator com proofs reais (LOW priority)
**Contexto:** O `transact()` do Cloak já gera proofs reais via relay. O gatekeeper chama `execute_with_license` que faz CPI para o Cloak program. A verificação on-chain do proof acontece no Cloak program (não no gatekeeper).

**Status:** Funcional — o gatekeeper não precisa gerar proofs, apenas encaminhar para o Cloak.

### Melhorias opcionais
1. **Audit page real** — Integrar `scanTransactions` quando `viewKey` estiver completo
2. **Root-stale retry pattern** — Implementar retry (3x) para falhas de merkle root
3. **Operator rotation threshold** — Restringir `set_operator` a threshold maior

---

## 🔧 Contexto Técnico Essencial

### Cloak SDK (devnet) — Em uso
```typescript
import { 
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  transact,
  computeUtxoCommitment,
  fullWithdraw,
} from "@cloak.dev/sdk-devnet";
```

### Fluxo atual
```
Send Page:
  → Gera UTXO (keypair + blinding)
  → computeUtxoCommitment(utxo)
  → Cria proposal (commitment no payload hash)

Operator Page:
  → cloakDeposit() — transact() com zero inputs
  → PATCH /api/stealth/[id]/utxo — guarda UTXO data
  → execute_with_license — CPI para Cloak program

Claim Page:
  → GET /api/stealth/[cofre] — busca invoice com UTXO data
  → fullWithdraw(utxo, recipient) — retira fundos reais
  → POST /api/stealth/[id]/claim — marca como claimed
```

### Program IDs
- Cloak devnet: `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`
- Gatekeeper: `WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J`
- Cloak mock: `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe` (não usado para deposits)

### Prisma Schema (atualizado)
```prisma
model StealthInvoice {
  // ... campos base ...
  claimedAt           DateTime?
  claimedBy           String?
  // UTXO data para claim
  utxoAmount          String?
  utxoPrivateKey      String?
  utxoPublicKey       String?
  utxoBlinding        String?
  utxoMint            String?
  utxoLeafIndex       Int?
  utxoCommitment      String?
}
```

### Testes
- `pnpm test:int` — 6 suites passando (bankrun)
- `pnpm test:unit` — Config pronto (vitest config criado)

### Comandos úteis
```bash
# Typecheck
pnpm -F @cloak-squads/core exec tsc --noEmit

# Testes
pnpm test:int       # bankrun (6 suites)

# Lint (ficheiros modificados)
pnpm biome check --fix apps/web/lib/init-commitment.ts \
  apps/web/app/cofre/[multisig]/send/page.tsx \
  apps/web/app/cofre/[multisig]/operator/page.tsx \
  apps/web/app/cofre/[multisig]/payroll/page.tsx \
  apps/web/app/api/proposals/route.ts \
  apps/web/app/api/payrolls/route.ts \
  packages/core/src/commitment.ts \
  apps/web/app/api/stealth/[id]/claim/route.ts \
  apps/web/app/claim/[stealthId]/page.tsx
```

---

## ⚠️ Riscos e Blockers Conhecidos

1. **Prisma migration** — Schema atualizado mas migration não gerada (Prisma CLI não disponível no ambiente)
   - **Workaround:** Rodar `pnpm prisma db push` localmente para aplicar schema
2. **Cloak relay pode estar down** — devnet não é garantido
3. **Devnet reset** — Solana Foundation reseta periodicamente
4. **Settlement delay** — 20s após `transact()` para confirmação

---

## 📋 Checklist para Deploy

- [ ] Aplicar Prisma migration: `cd apps/web && pnpm prisma db push`
- [ ] Verificar env vars:
  - `NEXT_PUBLIC_CLOAK_PROGRAM_ID=Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`
  - `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J`
- [ ] Testar fluxo completo: send → approve → operator execute → claim
- [ ] Verificar saldo devnet para testes

---

## 📁 Ficheiros Modificados (esta sessão)

| Ficheiro | Mudança |
|----------|---------|
| `packages/core/src/commitment.ts` | Tipos UTXO (backward compat) |
| `apps/web/lib/init-commitment.ts` | `computeUtxoCommitment` |
| `apps/web/app/cofre/[multisig]/send/page.tsx` | UTXO commitment scheme |
| `apps/web/app/cofre/[multisig]/payroll/page.tsx` | UTXO para batch |
| `apps/web/app/cofre/[multisig]/operator/page.tsx` | `cloakDepositBrowser()` + store UTXO |
| `apps/web/app/api/proposals/route.ts` | Schema Zod com UTXO fields |
| `apps/web/app/api/payrolls/route.ts` | Schema Zod com UTXO fields |
| `apps/web/app/api/stealth/[id]/claim/route.ts` | **NOVO** — POST claim |
| `apps/web/app/api/stealth/[id]/utxo/route.ts` | **NOVO** — PATCH UTXO data |
| `apps/web/app/api/stealth/[cofre]/route.ts` | Retorna UTXO fields |
| `apps/web/app/claim/[stealthId]/page.tsx` | `fullWithdraw` real |
| `apps/web/prisma/schema.prisma` | Campos UTXO em StealthInvoice |
| `docs/ARCHITECTURE.md` | Atualizado com UTXO flow |
| `docs/SECURITY.md` | Checklist atualizado |
| `docs/devnet-blocker.md` | Status: RESOLVED |
| `docs/cloak-discord-report.md` | Update log |
| `tests/unit/vitest.config.ts` | **NOVO** — Config vitest |

---

*Handoff atualizado após sessão de implementação FASE 1-3.*
