# Cloak-Mock Removal — Bloco 5 Runbook

> **NÃO executar agora.** Este é o runbook do **Bloco 5 futuro**. Spec separada será criada quando for hora de executar. Conteúdo aqui é a referência viva.

## Por quê remover

`cloak-mock` é um stub Anchor program (`programs/cloak-mock/`) que o gatekeeper invoca via CPI com discriminator `global:stub_transact`. Função: bookkeeping (incrementa `tx_count`, regista nullifier). **Não testa privacidade real do Cloak.**

A Cloak team confirmou (resposta a `docs/cloak-discord-report.md`) que o caminho correto é chamar `transact()` do SDK diretamente — esse é o discriminator `0` aceite pelo programa devnet em `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`.

## Mecanismo endossado: `cloakDeposit()` wrapper

Já implementado em `packages/core/src/cloak-deposit.ts` (Bloco 3.5). Snippet baseado no código vivo de `devnet.cloak.ag` (`devnet/web/hooks/use-cloak-sdk.ts:611`).

**Não usar `sdk.deposit()` em lado nenhum.**

## Por que Option B (não Option C)

Per `docs.cloak.ag/development/devnet` e análise em `docs/cloak-real-integration-analysis.md`:

- Account layouts e instruction discriminators do Cloak real **não são publicamente documentados**
- `buildTransactInstruction` **não é exportada** no SDK
- Proof generation está acoplada à submissão dentro de `transact()` — não dá para gerar proof + passar para CPI separadamente
- CPI direto gatekeeper→Cloak (Option C) requer reverse-engineering do SDK + manter compatibilidade com upgrades unilaterais da Cloak — alto risco

**Option B:** remover o CPI inteiro do gatekeeper. Operator chama `transact()` numa transação separada antes de `execute_with_license`. Gatekeeper só consome a license (state machine).

## Mudanças Rust (`programs/cloak-gatekeeper/src/instructions/execute_with_license.rs`)

Remover (~50 linhas):
- Const `CLOAK_PROGRAM_ID` + os dois `#[cfg(...)]`
- Função `build_stub_transact_data`
- Bloco `let ix = Instruction { ... };` + `invoke(&ix, ...)?`
- Da struct `ExecuteWithLicense`: remover `cloak_program`, `cloak_pool`, `nullifier_record`
- Parâmetros `proof_bytes: [u8; 256]` e `merkle_root: [u8; 32]` do `handler`

Manter:
- Validação operator + license expiry + license status + payload_hash match
- `license.status = Consumed`
- `emit!(LicenseConsumed { ... })` — opcionalmente substituir `cloak_tx_signature_hint` por `cloak_tx_signature: [u8; 64]` passado pelo cliente (auditoria off-chain)

Resultado: `execute_with_license` vira ~40 linhas, sem CPI, só state machine.

## Mudanças TypeScript

| Ficheiro | Mudança |
|---|---|
| `apps/web/lib/gatekeeper-instructions.ts` | `buildExecuteWithLicenseIx`: remover keys `cloakProgram`, `cloakPool`, `nullifierRecord`; remover args `proofBytes`/`merkleRoot` |
| `apps/web/app/cofre/[multisig]/operator/page.tsx` | Remover mock proof gen; chamar `cloakDeposit(...)` antes de `execute_with_license`; passar signature da tx Cloak para o evento |
| `apps/web/app/cofre/[multisig]/send/page.tsx` | Igual: usar `cloakDeposit()` para o depósito real |
| `apps/web/lib/env.ts` | Remover `NEXT_PUBLIC_CLOAK_MOCK_PROGRAM_ID` |
| `tests/integration/helpers/gatekeeper.ts` | Remover `MOCK_PROGRAM_ID`, `poolPda`, `nullifierPda`, `decodeStubPool` |
| `tests/integration/f1-send.test.ts` | Não passar mais cloak/pool/nullifier; ajustar asserts |
| `tests/integration/f2-batch.test.ts` | Igual |
| `tests/integration/spike-cpi.test.ts` | **Deletar** (testava CPI mock) |
| `scripts/f1-e2e-devnet.ts` | Usar `cloakDeposit()` em vez de mock pool init |
| `scripts/setup-demo-cofre.ts` | Remover init do mock pool |

## Workspace cleanup

| Ficheiro | Mudança |
|---|---|
| `Anchor.toml` | Remover `cloak_mock = "..."` de `[programs.localnet]` e `[programs.devnet]` |
| `Cargo.toml` | Remover `"programs/cloak-mock"` de `members` |
| `programs/cloak-mock/` | **Deletar diretório inteiro** |

## Sequência de redeploy (devnet)

1. Branch `feat/remove-cloak-mock`
2. Implementar Rust + TS na ordem acima
3. `pnpm test:int` passa com nova shape (helpers atualizados)
4. `anchor build -p cloak_gatekeeper`
5. `anchor deploy --provider.cluster devnet -p cloak_gatekeeper` — **upgrade in-place** (mesmo program ID, requer upgrade authority)
6. `pnpm seed:reset` — cofres existentes ficam órfãos pela mudança de struct
7. `solana program close 2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe --bypass-warning` (recuperar SOL — opcional)
8. `anchor idl upgrade` para o gatekeeper

## Risco principal

Breaking change: cofres existentes têm licenças com estado que referencia contas mock. Após upgrade, `execute_with_license` não encontra `cloak_pool`/`nullifier_record`. Solução: deploy novo program ID (recomendado) ou aceitar que cofres antigos ficam inutilizáveis.
