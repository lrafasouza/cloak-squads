# HANDOFF — Remover Cloak-Mock (Bloco 5)

**Data:** 2026-04-27  
**Solicitação:** Remover COMPLETAMENTE o cloak-mock. Nada de mock. Gatekeeper deve funcionar como state machine puro.  
**Status:** ✅ IMPLEMENTADO em 2026-04-28
**Novo Program ID:** `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` (devnet)

---

## 1. ARQUITETURA ATUAL (com mock)

```
Operator tx:
  ├─▶ cloakDeposit() → transact() → Cloak real (deposita SOL)
  └─▶ execute_with_license → CPI → cloak-mock::stub_transact
        ├─▶ Guarda nullifier em nullifier_record
        ├─▶ XOR commitment no merkle_root_stub
        └─▶ Incrementa tx_count
        → License.status = Consumed
```

**Problema:** O CPI para cloak-mock é falso. O gatekeeper passa `proof_bytes: [0u8; 256]` e o mock aceita sem verificar. O dinheiro real já entrou no Cloak no `cloakDeposit()`, mas o gatekeeper ainda faz teatro com o mock.

## 2. ARQUITETURA TARGET (sem mock)

```
Operator tx 1:
  └─▶ cloakDeposit() → transact() → Cloak real (deposita SOL) ✅ já existe

Operator tx 2:
  └─▶ execute_with_license → state machine puro
        ├─▶ Verifica operator identity
        ├─▶ Verifica license nao expirou
        ├─▶ Verifica license esta Active
        ├─▶ Verifica payload_hash match
        └─▶ License.status = Consumed
        → emit!(LicenseConsumed { ... })
```

**Mudanca filosofica:** O gatekeeper NUNCA mais faz CPI para programa externo. Ele é um state machine puro: verifica condicoes, consome license, emite evento.

O deposit/withdraw real já acontece em transacao SEPARADA via `transact()` do SDK (já implementado no frontend no operator page).

## 3. MUDANCAS POR ARQUIVO

### 3.1 Rust — execute_with_license.rs

**ARQUIVO:** `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs`

**Remover:**
- Linhas 12-15: `CLOAK_PROGRAM_ID` const e cfg
- Linhas 42-43: Parametros `proof_bytes` e `merkle_root` do handler
- Linhas 66-74: Validacao de `cloak_program` (require_keys_eq + executable check)
- Linhas 76-95: Bloco CPI inteiro (`let ix = Instruction... invoke(...)`)
- Linhas 108-123: Funcao `build_stub_transact_data`
- Linhas 137-144: Contas `cloak_program`, `cloak_pool`, `nullifier_record` na struct ExecuteWithLicense

**Manter:**
- Validacao operator (linhas 45-49)
- Validacao expiry (linhas 51-55)
- Validacao status Active (linhas 56-59)
- Validacao payload_hash (linhas 61-65)
- Marcar license como Consumed (linha 97)
- emit! LicenseConsumed (linhas 99-103)

**Resultado esperado:** ~50 linhas no total (hoje tem 146).

### 3.2 Rust — lib.rs

**ARQUIVO:** `programs/cloak-gatekeeper/src/lib.rs`

**Mudar:**
```rust
// DE:
pub fn execute_with_license(
    ctx: Context<ExecuteWithLicense>,
    invariants: PayloadInvariants,
    proof_bytes: [u8; 256],
    merkle_root: [u8; 32],
) -> Result<()> {
    instructions::execute_with_license::handler(ctx, invariants, proof_bytes, merkle_root)
}

// PARA:
pub fn execute_with_license(
    ctx: Context<ExecuteWithLicense>,
    invariants: PayloadInvariants,
) -> Result<()> {
    instructions::execute_with_license::handler(ctx, invariants)
}
```

### 3.3 IDL JSON

**ARQUIVO:** `apps/web/lib/idl/cloak_gatekeeper.json`

**Remover da instruction `execute_with_license`:**
- Contas: `cloak_program`, `cloak_pool`, `nullifier_record`
- Args: `proof_bytes` (array u8 256), `merkle_root` (array u8 32)

**Nota:** Se usar `anchor build`, a IDL sera regenerada automaticamente. Senao, editar manualmente.

### 3.4 Frontend — gatekeeper-instructions.ts

**ARQUIVO:** `apps/web/lib/gatekeeper-instructions.ts`

**Mudar `buildExecuteWithLicenseIxBrowser`:**

```typescript
// DE (atual):
export async function buildExecuteWithLicenseIxBrowser(params: {
  multisig: PublicKey;
  operator: PublicKey;
  invariants: PayloadInvariants;
  proofBytes: Uint8Array;       // REMOVER
  merkleRoot: Uint8Array;       // REMOVER
  cloakProgram: PublicKey;      // REMOVER
  pool: PublicKey;              // REMOVER
  nullifierRecord: PublicKey;   // REMOVER
})

// PARA:
export async function buildExecuteWithLicenseIxBrowser(params: {
  multisig: PublicKey;
  operator: PublicKey;
  invariants: PayloadInvariants;
})
```

**Dentro da funcao:**
- Remover `proofBytes` e `merkleRoot` do `concatBytes`
- Remover keys: `cloakProgram`, `pool`, `nullifierRecord`
- Resultado: apenas 4 keys (cofre, license, operator, system_program)

### 3.5 Frontend — operator/page.tsx

**ARQUIVO:** `apps/web/app/cofre/[multisig]/operator/page.tsx`

**Mudancas:**
1. Remover import do CLOAK_MOCK_PROGRAM_ID
2. Remover `cloakProgram`, `pool`, `nullifierRecord` do `executeSingle()`
3. Remover `proofBytes` e `merkleRoot` dos params
4. Nao precisa mais calcular PDAs do mock

**Fluxo simplificado:**
```typescript
async function executeSingle(draft: SingleDraft, doCloakDeposit = true) {
  // 1. Cloak deposit (real) — JA EXISTE
  if (doCloakDeposit) {
    await cloakDepositBrowser(...);
  }
  
  // 2. execute_with_license — SIMPLIFICADO
  const ix = await buildExecuteWithLicenseIxBrowser({
    multisig: multisigAddress,
    operator: wallet.publicKey,
    invariants: { nullifier, commitment, amount, tokenMint, recipientVkPub, nonce },
    // NAO precisa mais: proofBytes, merkleRoot, cloakProgram, pool, nullifierRecord
  });
  
  // Resto igual (simulacao, confirmacao, etc.)
}
```

### 3.6 Frontend — env.ts

**ARQUIVO:** `apps/web/lib/env.ts`

**Remover:**
- `NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID` do schema Zod

### 3.7 Testes de Integracao

**ARQUIVOS afetados:**
- `tests/integration/spike-cpi.test.ts` → **DELETAR** (testava CPI mock)
- `tests/integration/f1-send.test.ts` → Remover contas mock dos asserts
- `tests/integration/f2-batch.test.ts` → Igual
- `tests/integration/f3-audit.test.ts` → Provavelmente nao afetado
- `tests/integration/e2e-full-flow.test.ts` → Remover contas mock
- `tests/integration/helpers/gatekeeper.ts` → Remover MOCK_PROGRAM_ID, poolPda, nullifierPda

**Helpers:**
- `tests/integration/helpers/gatekeeper.ts` — Remover funcoes relacionadas a mock

### 3.8 Test Helpers — gatekeeper.ts

**ARQUIVO:** `tests/integration/helpers/gatekeeper.ts`

**Remover:**
- Linha 35: `export const MOCK_PROGRAM_ID`
- Linhas 140-153: `encodeStubPool()` (não existe mais StubPool)
- Linhas 236-245: `decodeStubPool()` (não existe mais StubPool)
- Linhas 275-280: `poolPda()` (PDA do mock)
- Linhas 282-287: `nullifierPda()` (PDA do mock)

**Manter:**
- Tudo relacionado a Cofre, License, ViewDistribution
- `GATEKEEPER_PROGRAM_ID`, `SQUADS_HARNESS_PROGRAM_ID`
- `computePayloadHash()`, PDAs do gatekeeper

### 3.9 Environment Files

**ARQUIVO:** `.env.example`

**Remover:**
- Linha 15: `NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID=...`
- Linhas 5-6: Comentários sobre "using mock on devnet"
- Linhas 10-13: Comentários sobre SDK blocked (já resolvido)

**ARQUIVO:** `apps/web/.env.local` (se existir)
- Remover `NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID`

### 3.10 Workspace Cleanup

**ARQUIVOS:**
- `Anchor.toml` → Remover `cloak_mock` de `[programs.localnet]` e `[programs.devnet]`
- `Cargo.toml` → Remover `"programs/cloak-mock"` de `members`
- `programs/cloak-mock/` → **DELETAR DIRETORIO INTEIRO**

### 3.11 Events (opcional)

**ARQUIVO:** `programs/cloak-gatekeeper/src/events.rs`

**Nota:** O evento `LicenseConsumed` tem campo `cloak_tx_signature_hint: [u8; 32]`. Este campo pode ser mantido (continua sendo o commitment como hint de auditoria). Não precisa mudar.

## 4. SEQUENCIA DE IMPLEMENTACAO

```
1. Backup do repo (git stash / branch)
2. Rust: execute_with_license.rs (remover CPI)
3. Rust: lib.rs (atualizar assinatura)
4. Anchor build -p cloak_gatekeeper (gerar nova IDL)
5. Copiar nova IDL para apps/web/lib/idl/
6. Frontend: gatekeeper-instructions.ts
7. Frontend: operator/page.tsx
8. Frontend: env.ts
9. Tests: Atualizar/deletar testes afetados
10. Cleanup: Deletar programs/cloak-mock/
11. Cleanup: Anchor.toml, Cargo.toml
12. pnpm test:int (deve passar com nova shape)
13. pnpm -F @cloak-squads/core exec tsc --noEmit
14. Commit
```

## 5. RISCOS E CONSIDERACOES

### 5.1 Breaking Change (CRITICO)
Cofres existentes no devnet ficam ORFAOS. A struct `execute_with_license` mudou (menos contas). Licenses criadas com a versao antiga NAO funcionam com o novo gatekeeper.

**Solucoes:**
- **Recomendado:** Deploy com NOVO program ID (novo endereco). Cofres antigos ficam inutilizaveis mas nao quebram. E necessario criar novos cofres apos o deploy.
- **Alternativa:** Upgrade in-place (mesmo program ID) + reinit cofres (mais arriscado).

**Impacto no hackathon:** Se ja existem cofres de demo no devnet, eles precisam ser recriados.

### 5.2 Evento LicenseConsumed
Hoje o evento tem `cloak_tx_signature_hint: [u8; 32]` que é o commitment. Pode-se manter assim (commitment como hint) ou adicionar um campo opcional `cloak_tx_signature: String` passado pelo cliente.

**Recomendacao:** Manter como está. O commitment já identifica unicamente a transacao.

### 5.3 Testes Bankrun
Os testes bankrun carregam o programa SBF do gatekeeper. Apos mudar o Rust, precisa recompilar:
```bash
anchor build -p cloak_gatekeeper
```
Os testes bankrun usam o `.so` gerado em `target/deploy/cloak_gatekeeper.so`.

**Nota:** Os testes precisam ser atualizados porque a instruction `execute_with_license` agora tem menos accounts. O helper `buildIxData` e os testes que constroem a tx manualmente precisam remover as contas mock.

## 6. REFERENCIAS

- `docs/CLOAK_MOCK_REMOVAL.md` — Runbook original (atualizar apos implementacao)
- `programs/cloak-gatekeeper/src/instructions/execute_with_license.rs` — Codigo a modificar
- `apps/web/lib/gatekeeper-instructions.ts` — Builder de instruction
- `apps/web/app/cofre/[multisig]/operator/page.tsx` — Frontend a simplificar

## 7. DEFINICAO DE PRONTO

- [x] Gatekeeper nao faz mais CPI para programa externo
- [x] execute_with_license é state machine puro (verificar + consumir)
- [x] Nenhuma referencia a `cloak-mock`, `CLOAK_MOCK`, `stub_transact`, `MOCK_PROGRAM_ID` no codebase
- [x] Testes bankrun passam com nova shape (5/5 suites)
- [x] Typecheck passa
- [x] programs/cloak-mock/ deletado
- [x] Anchor.toml e Cargo.toml atualizados
- [x] Frontend operator page simplificado (sem mock accounts)
- [x] .env.example atualizado (sem CLOAK_MOCK_PROGRAM_ID)
- [x] Test helpers atualizados (sem encodeStubPool, decodeStubPool, poolPda, nullifierPda)
- [x] IDL regenerada via anchor build
- [x] Deploy com novo program ID: `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq`
- [x] .env.local atualizado com novo program ID
- [x] Test harness atualizado com novo gatekeeper program ID

## 8. VERIFICACAO POS-IMPLEMENTACAO

Após completar todos os passos, verifique que nao restou nada de mock:

```bash
# 1. Buscar por referencias ao mock no codebase
grep -r "cloak-mock\|cloak_mock\|CLOAK_MOCK\|stub_transact\|MOCK_PROGRAM_ID\|StubPool" \
  --include="*.rs" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.toml" \
  . --exclude-dir=target --exclude-dir=node_modules --exclude-dir=.git

# Deve retornar VAZIO (ou so o handoff/documentacao)

# 2. Verificar que o programa foi rebuildado
ls -la target/deploy/cloak_gatekeeper.so
# Timestamp deve ser recente

# 3. Rodar testes
pnpm test:int
# Todas as suites devem passar

# 4. Typecheck
pnpm -F @cloak-squads/core exec tsc --noEmit

# 5. Build do frontend
cd apps/web && pnpm build
# Deve compilar sem erros
```

---

*Este handoff foi gerado apos investigacao completa do codebase. O agente seguinte deve seguir a sequencia na secao 4.*
*Ultima atualizacao: 2026-04-27 (inclui todos os ficheiros descobertos na investigacao)*
