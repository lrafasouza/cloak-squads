# Cloak-Mock Removal — COMPLETED

> **Status:** ✅ IMPLEMENTADO em 2026-04-27
> **Gatekeeper:** State machine puro (sem CPI externo)

## Resumo

O `cloak-mock` foi completamente removido do codebase. O gatekeeper agora opera como uma state machine pura:
- Verifica identidade do operator
- Verifica validade da license (não expirou, não consumida)
- Verifica payload hash
- Marca license como `Consumed`
- Emite evento `LicenseConsumed`

O deposit/withdraw real continua acontecendo via `transact()` do Cloak SDK numa transação separada (já implementado no frontend).

## O que foi removido

### Programas
- ❌ `programs/cloak-mock/` — Diretório inteiro deletado
- ❌ CPI de `execute_with_license` para programa externo
- ❌ `proof_bytes: [u8; 256]` e `merkle_root: [u8; 32]` dos parâmetros
- ❌ Contas `cloak_program`, `cloak_pool`, `nullifier_record` da struct

### Frontend
- ❌ `NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID` de `env.ts` e `.env.*`
- ❌ Parâmetros `proofBytes`, `merkleRoot` em `buildExecuteWithLicenseIxBrowser`
- ❌ Contas mock do operator page (`cloakProgram`, `pool`, `nullifierRecord`)
- ❌ Mensagens sobre "mock proof" na UI

### Testes
- ❌ `tests/integration/spike-cpi.test.ts` — Deletado
- ❌ `encodeStubPool()`, `decodeStubPool()`, `poolPda()`, `nullifierPda()` dos helpers
- ✅ Testes atualizados para nova shape (4 contas em vez de 7)

### Workspace
- ❌ `cloak_mock` removido de `Anchor.toml` e `Cargo.toml`
- ❌ Scripts `deploy-cloak-mock.ts` e `f1-e2e-devnet.ts` deletados
- ❌ Comando `deploy:mock` removido do `package.json`

## Arquitetura resultante

```
Operator tx 1:
  └─▶ cloakDeposit() → transact() → Cloak real (deposita SOL) ✅

Operator tx 2:
  └─▶ execute_with_license → state machine puro
        ├─▶ Verifica operator identity
        ├─▶ Verifica license não expirou
        ├─▶ Verifica license está Active
        ├─▶ Verifica payload_hash match
        └─▶ License.status = Consumed
        → emit!(LicenseConsumed { ... })
```

## Sequência de deploy (devnet)

1. ✅ Implementar Rust + TS (feito)
2. ✅ `anchor build -p cloak_gatekeeper` (feito)
3. ✅ `pnpm test:int` passa (feito — 5 suites)
4. 🔄 **Deploy com NOVO program ID** (recomendado — breaking change)
5. 🔄 Atualizar `.env.local` com novo program ID
6. 🔄 `pnpm seed:reset` — criar novos cofres
7. 🔄 `anchor idl upgrade` para o novo program ID

## Program ID atual

- **Gatekeeper:** `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` (novo deploy após remoção do mock)
- **Squads v4:** `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`
- **Cloak devnet:** `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`
- ~~**Cloak-mock:** `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe`~~ ❌ REMOVIDO

## Risco principal

**Breaking change:** Cofres existentes no devnet ficam ORFÃOS. A struct `execute_with_license` mudou (menos contas). Licenses criadas com a versão antiga NÃO funcionam com o novo gatekeeper.

**Solução adotada:** Deploy com novo program ID (novo endereço). Cofres antigos ficam inutilizáveis mas não quebram. É necessário criar novos cofres após o deploy.

## Definição de Pronto (checklist)

- [x] Gatekeeper não faz mais CPI para programa externo
- [x] execute_with_license é state machine puro (verificar + consumir)
- [x] Nenhuma referência a `cloak-mock`, `CLOAK_MOCK`, `stub_transact`, `MOCK_PROGRAM_ID` no codebase
- [x] Testes bankrun passam com nova shape
- [x] Typecheck passa
- [x] programs/cloak-mock/ deletado
- [x] Anchor.toml e Cargo.toml atualizados
- [x] Frontend operator page simplificado (sem mock accounts)
- [x] .env.example atualizado (sem CLOAK_MOCK_PROGRAM_ID)
- [x] Test helpers atualizados (sem encodeStubPool, decodeStubPool, poolPda, nullifierPda)
- [x] IDL regenerada via anchor build
