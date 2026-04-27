# Handoff — Cloak-Squads Implementation

**Data:** 2026-04-27  
**Sessão anterior:** Implementação Blocos 2+3 + B1 (Security)  
**Próxima sessão:** C1-C3 + B3 + review + MEDIUM priority  

---

## ✅ Estado Atual

### O que foi entregue nesta sessão
- **14 tasks do Plano Blocos 2+3** completas (commits `1f5b39d`..`ca9371f`)
- **B1 (Security HIGH):** Verificação de assinatura em audit-links implementada
- **Wrapper `cloakDeposit()`:** Funcionando, endossado pela Cloak team
- **Testes:** 6 suites passando (unit + integration bankrun)
- **QA:** Typecheck OK, lint OK, testes passando

### Commits recentes
```
ca9371f test: fix f3-audit and e2e-full-flow tests, complete Task 14 QA
2aa065a docs: update INVENTARIO_COMPLETO.md with completed tasks
2746b41 style: fix linting issues in new scripts and cloak-deposit
9d147d8 feat(core): add cloakDeposit() wrapper endorsed by Cloak team
a203ef3 fix(api): verify signature in audit-links creation (B1)
```

---

## 🎯 Próximas Tarefas (ordem de execução)

### FASE 1 — Integração Real Cloak (HIGH Priority)

#### C3. Migrar commitment scheme (PRÉ-REQUISITO)
**Complexidade:** Alta  
**Ficheiros:** `apps/web/lib/init-commitment.ts`, `apps/web/app/cofre/[multisig]/send/page.tsx`

**Contexto técnico:**
- Atualmente o app usa `computeCommitment(amount, r, sk_spend)` (legacy)
- O Cloak real usa `computeUtxoCommitment({ amount, keypair, blinding, mintAddress })`
- Produzem valores DIFERENTES para os mesmos inputs
- Referência: `docs/cloak-real-integration-analysis.md:361-371`

**Mudanças necessárias:**
1. `init-commitment.ts`: Trocar import de `computeCommitment` para `computeUtxoCommitment`
2. `send/page.tsx`: Gerar `keypair` + `blinding` em vez de `r` + `sk_spend`
3. `operator/page.tsx`: Reconstruir commitment via UTXO scheme ao executar
4. SessionStorage: Persistir formato novo (`keypair`, `blinding`, `mint`)

**API do SDK:**
```typescript
// Novo
import { computeUtxoCommitment, generateUtxoKeypair } from "@cloak.dev/sdk-devnet";

const keypair = await generateUtxoKeypair();
const utxo = await createUtxo(amount, keypair, mint);
const commitment = await computeUtxoCommitment({
  amount,
  keypair,
  blinding: utxo.blinding,
  mintAddress: mint,
});
```

**Teste:** Verificar se o commitment gerado é válido para o Cloak devnet.

---

#### C1. Wire cloakDeposit() no operator page
**Complexidade:** Média  
**Depende de:** C3 (commitment scheme)  
**Ficheiro:** `apps/web/app/cofre/[multisig]/operator/page.tsx`

**Contexto técnico:**
- Atualmente o operator só chama `execute_with_license` (CPI mock)
- Precisa chamar `cloakDeposit()` PRIMEIRO em tx separada
- Depois chama `execute_with_license` (bookkeeping + consome license)

**Fluxo esperado:**
```
1. Operator clica "Execute"
2. Chama cloakDeposit(connection, payer, amount) → tx separada → deposit real no Cloak
3. Recebe signature da tx Cloak
4. Chama execute_with_license → CPI mock (bookkeeping) → license Consumed
5. UI mostra sucesso com link para explorer da tx Cloak
```

**Importante:**
- Usar `wallet.signTransaction` ou `sendTransaction` do wallet adapter
- Passar `connection` e `wallet` como parâmetros
- Capturar erros do Cloak relay (pode estar down)
- Settlement delay: 20s após `transact()`

**Ficheiro já exporta:**
```typescript
import { cloakDeposit } from "@cloak-squads/core";
// ou diretamente:
import { cloakDeposit } from "../../../../../packages/core/src/cloak-deposit";
```

---

#### C2. Wire cloakDeposit() no send page
**Complexidade:** Média  
**Depende de:** C3 (commitment scheme)  
**Ficheiro:** `apps/web/app/cofre/[multisig]/send/page.tsx`

**Contexto técnico:**
- Atualmente no fluxo de envio, o deposit é só mock (via gatekeeper)
- Após criar proposal e ser aprovada, o deposit real deve acontecer via `transact()`
- Ou: o operator faz o deposit real no momento do execute

**Decisão de design:**
- **Option A:** Send page cria a proposal com commitment correto (C3). O deposit real acontece no operator page (C1) quando executa.
- **Option B:** Send page faz o deposit real imediatamente (não recomendado — gasta SOL antes da aprovação)

**Recomendação:** Implementar Option A (deposit no operator page). O send page só precisa gerar o commitment correto (C3).

---

#### B3. Criar API route POST /api/stealth/[id]/claim
**Complexidade:** Baixa  
**Ficheiro:** Novo `apps/web/app/api/stealth/[id]/claim/route.ts`

**Contexto técnico:**
- Atualmente o claim é só cosmético (`setTimeout` de 1.5s)
- O status no DB fica `"pending"` para sempre
- Precisa de uma API para atualizar para `"claimed"` + `claimedAt` + `claimedBy`

**Implementação:**
```typescript
// apps/web/app/api/stealth/[id]/claim/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { claimedBy } = body; // wallet address

  const invoice = await prisma.stealthInvoice.update({
    where: { id },
    data: {
      status: "claimed",
      claimedAt: new Date(),
      claimedBy,
    },
  });

  return NextResponse.json(invoice);
}
```

**Integração no frontend:**
```typescript
// apps/web/app/claim/[stealthId]/page.tsx:163
await fetch(`/api/stealth/${invoice.id}/claim`, {
  method: "POST",
  body: JSON.stringify({ claimedBy: wallet.publicKey.toBase58() }),
});
```

---

### FASE 2 — Code Review

Após implementar C1-C3 + B3, fazer:
1. **Review de segurança:** Verificar se `cloakDeposit()` está sendo chamado corretamente
2. **Review de UX:** Verificar se o usuário vê feedback da tx Cloak
3. **Testes:** Rodar `pnpm test:int` e `pnpm test:unit`
4. **Typecheck:** `pnpm -F @cloak-squads/core exec tsc --noEmit`

---

### FASE 3 — Medium Priority (se tudo estiver OK)

#### B2. Integrar claim real com fullWithdraw do Cloak SDK
**Ficheiro:** `apps/web/app/claim/[stealthId]/page.tsx`

**Contexto:**
- O Cloak SDK tem função `fullWithdraw()` para retirar fundos
- Requer `spendKey` e `blinding` do invoice (devem ser guardados na criação)
- Verificar documentação do SDK para parâmetros exatos

#### B4. Audit page com dados reais do Cloak scan
**Ficheiro:** `apps/web/app/audit/[linkId]/page.tsx`

**Contexto:**
- Atualmente usa `generateDeterministicMockData()`
- Precisa integrar com Cloak scan API usando `viewKey` derivada
- Verificar se a API de scan está disponível em devnet

#### B5. Operator com proofs reais
**Depende de:** C1-C3 completos  
**Contexto:** Quando o commitment scheme é real, os proofs já são gerados pelo `transact()` do Cloak. O gatekeeper não precisa mais de mock proofs.

#### D1-D6. Atualizar docs desatualizados
**Lista:**
- D1: ARCHITECTURE.md — models desatualizados
- D2: SECURITY.md — rate limiting (já implementado)
- D3: SECURITY.md — hardcoded CPI target (já implementado)
- D4: SECURITY.md — checklist unchecked
- D5: cloak-discord-report.md — update log
- D6: devnet-blocker.md — workaround desatualizado

---

## 🔧 Contexto Técnico Essencial

### Cloak SDK (devnet)
```typescript
import { 
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  transact,
  computeUtxoCommitment,
} from "@cloak.dev/sdk-devnet";
```

### Program IDs
- Cloak devnet: `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`
- Gatekeeper: `WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J`
- Cloak mock: `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`

### Wrapper já implementado
`packages/core/src/cloak-deposit.ts` — função `cloakDeposit()` que:
1. Gera UTXO keypair
2. Cria output UTXO
3. Chama `transact()` com zero inputs (deposit puro)
4. Retorna signature, leafIndex, spendKey, blinding

### Testes existentes
- `tests/unit/f4-stealth.test.ts` — vitest, crypto primitives
- `tests/integration/f1-send.test.ts` — bankrun, single license
- `tests/integration/f2-batch.test.ts` — bankrun, batch licenses
- `tests/integration/f3-audit.test.ts` — bankrun, audit filter/CSV
- `tests/integration/e2e-full-flow.test.ts` — bankrun, scaffold F1+F2+F3
- `tests/devnet/cloak-deposit.devnet.test.ts` — live devnet (gated)

### Comandos úteis
```bash
# Typecheck
pnpm -F @cloak-squads/core exec tsc --noEmit

# Testes
pnpm test:unit      # vitest
pnpm test:int       # bankrun (6 suites)
pnpm test:devnet    # live devnet (precisa de SOL)

# Lint
pnpm lint           # biome check

# Scripts
pnpm seed:demo      # seed idempotente
pnpm seed:reset     # reset + seed
pnpm deploy:gk      # deploy gatekeeper
```

---

## ⚠️ Riscos e Blockers Conhecidos

1. **Cloak relay pode estar down** — devnet não é garantido
2. **Devnet reset** — Solana Foundation reseta periodicamente
3. **Commitment scheme migration** — Se feito errado, quebra todo o fluxo
4. **Wallet adapter** — Precisa estar conectado para `cloakDeposit()`
5. **Settlement delay** — 20s após `transact()` para confirmação

---

## 📋 Checklist para Próxima Sessão

### Antes de começar
- [ ] Verificar se `pnpm install` está atualizado
- [ ] Verificar se devnet está operacional: `solana cluster-version --url devnet`
- [ ] Verificar se relay está up: `curl -sf https://api.devnet.cloak.ag/range-quote -X POST -d '{}'`

### Durante implementação
- [ ] C3: Migrar commitment scheme
- [ ] C1: Wire cloakDeposit() no operator
- [ ] C2: Wire cloakDeposit() no send (se necessário)
- [ ] B3: API route para claim
- [ ] Testar: `pnpm test:int` deve passar
- [ ] Testar: `pnpm -F @cloak-squads/core exec tsc --noEmit`

### Após implementação
- [ ] Code review
- [ ] Se tudo OK → FASE 3 (Medium priority)

---

## 📁 Ficheiros Chave

| Ficheiro | Responsabilidade |
|----------|------------------|
| `packages/core/src/cloak-deposit.ts` | Wrapper endossado Cloak team |
| `apps/web/lib/init-commitment.ts` | Registra função de commitment (legacy) |
| `apps/web/app/cofre/[multisig]/send/page.tsx` | Cria proposal (usar computeUtxoCommitment) |
| `apps/web/app/cofre/[multisig]/operator/page.tsx` | Executa proposal (chamar cloakDeposit + execute) |
| `apps/web/app/claim/[stealthId]/page.tsx` | Claim invoice (integrar fullWithdraw) |
| `apps/web/app/api/audit-links/route.ts` | Criar audit links (assinatura já verificada) |
| `docs/cloak-real-integration-analysis.md` | Análise completa da integração |
| `docs/CLOAK_MOCK_REMOVAL.md` | Runbook para remover mock no futuro |

---

*Gerado automaticamente após sessão de implementação. Atualizar conforme progresso.*
