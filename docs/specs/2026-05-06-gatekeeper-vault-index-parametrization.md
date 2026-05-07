# Spec: Parametrização de `vault_index` no Cloak Gatekeeper (BUG-6 fix)

**Data:** 2026-05-06
**Autor:** Aegis architecture review
**Status:** ✅ Implementado 2026-05-07. Programa upgradado em `AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq` (devnet slot `460739362`). IDL bumped 0.1.0 → 0.2.0. Escopo expandido durante implementação para incluir também `emergency_close_license`. Smoke test devnet ainda pendente do usuário.
**Escopo:** Destravar private send / payroll / invoice stealth a partir de sub-vaults, removendo o hardcode de `vault_index = 0` nos handlers do gatekeeper.

---

## 0. TL;DR

Hoje qualquer operação privada (`issue_license`) só executa do **Primary vault** (`vault_index = 0`). Se o usuário cria um sub-vault e tenta um payroll dele, a `VaultTransactionExecute` da Squads falha com `InvalidAccount` (6014 / `0x177e`) — descoberto na proposal #23, multisig `5hrqq…HpG2`.

A causa são **duas constraints que se compõem**, em camadas diferentes:

1. **Aegis gatekeeper** (`programs/cloak-gatekeeper/src/instructions/issue_license.rs:14`): hardcode `verify_squads_vault_signer(&multisig, 0, &squads_vault)`.
2. **Squads on-chain** (`executable_transaction_message.rs:91`): qualquer conta com `is_signer = true` na **inner message persistida** precisa ser ou o vault PDA da `VaultTransaction.vault_index` ou um ephemeral signer.

Quando criamos a proposal com `vaultIndex = 1` e a inner message marca o vault[0] como signer (porque o gatekeeper exige), Squads rejeita antes do gatekeeper rodar.

A solução é parametrizar `vault_index` no programa e fazer o front passar o índice consistente em duas pontas: a derivação do PDA e o instruction data.

**Workaround atual:** front-end trava sub-vaults para os 3 flows que emitem license (commit `5aee013`). Funciona, mas força o usuário a mover fundos pro Primary antes de qualquer operação privada.

---

## 1. Contexto

### 1.1 Como o flow funciona hoje (vault[0]-only)

```
[member wallet]
    │ vaultTransactionCreate(vaultIndex=0, inner=[issue_license])
    ▼
[Squads VaultTransaction PDA]   ← inner message guarda vault[0] como signer
    │ proposalApprove (threshold)
    ▼
[VaultTransactionExecute]
    │ Squads valida: signers in inner == source vault OR ephemeral
    │     ✓ vault[0] é o source vault da tx → passa
    │ CPI → cloak-gatekeeper::issue_license(vault[0] como signer)
    │     ✓ verify_squads_vault_signer(multisig, 0, vault[0]) → passa
    ▼
[License criada]
    │ ... payroll/send-private/invoice prossegue
```

### 1.2 Como falha quando source = vault[1]

```
[member wallet]
    │ vaultTransactionCreate(vaultIndex=1, inner=[issue_license])
    ▼
[Squads VaultTransaction PDA]   ← inner message guarda vault[0] como signer (gatekeeper exige)
    │                              source vault da tx é vault[1]
    │ proposalApprove (threshold)
    ▼
[VaultTransactionExecute]
    │ Squads valida: signers in inner == source vault OR ephemeral
    │     ✗ vault[0] != vault[1] (source) e não é ephemeral
    │     → InvalidAccount 6014 / 0x177e
    │
    └─ gatekeeper sequer roda
```

### 1.3 Por que workaround de cliente não resolve

`apps/web/lib/squads-sdk.ts:481-488` rebaixa qualquer vault PDA da multisig de `is_signer=true` para `is_signer=false` antes de mandar a tx. **Isso só conserta a verificação de assinatura do web3.js** (que não tem a chave privada do PDA). A **inner message já está gravada on-chain** no momento do `vaultTransactionCreate`, com o flag `is_signer = true`. A validação `executable_transaction_message.rs:91` lê esses bytes — não a outer message — e rejeita.

### 1.4 Por que o cofre não precisa virar per-vault

`Cofre` é um conceito organizacional da multisig: tem `operator`, `view_key`, `revoked_audit`. Uma multisig = um cofre, sempre. `vault_index` aqui é só "qual vault está autorizando essa operação", não "qual vault possui licenses separadas". `cofrePda` (`packages/core/src/pda.ts:19`) continua keyado só no multisig.

---

## 2. Decisão de escopo

### 2.1 Lista completa de handlers que hardcodam `0`

| Handler | Tipo | Risco de governança |
|---|---|---|
| `issue_license` | Runtime (1x por send/payroll/invoice) | Baixo — só emite license, requer threshold |
| `revoke_audit` | Runtime (revoga diversifier vazado) | Baixo — só adiciona ao Vec de revogados |
| `init_cofre` | Bootstrap (1x por cofre) | Médio — define operator inicial |
| `set_operator` | Admin | **Alto** — troca operator de todo o cofre |
| `add_signer_view` | Admin | Médio — adiciona viewer key |
| `remove_signer_view` | Admin | Médio |
| `init_view_distribution` | Bootstrap (1x) | Baixo |
| `emergency_close_license` | Admin | **Alto** — permite cancelar licenses pendentes |

### 2.2 Recomendação original: parametrizar apenas runtime, manter admin em vault[0]

**Parametrizar:** `issue_license`, `revoke_audit` (2 handlers).
**Manter hardcoded:** `init_cofre`, `set_operator`, `add_signer_view`, `remove_signer_view`, `init_view_distribution`, `emergency_close_license` (6 handlers).

**Justificativa original:**

- Operações **runtime** devem rodar de qualquer vault — é o que destrava o produto.
- Operações **admin** (governança da cofre) devem exigir Primary. Caso contrário, qualquer threshold de sub-vault pode trocar o operator do cofre inteiro, ou usar `emergency_close_license` pra cancelar payroll de outro vault. É vetor de governança hostil.

### 2.2.1 Decisão real durante implementação (2026-05-07)

`emergency_close_license` foi **parametrizado também**. Análise do risco "sub-vault cancela license de outro vault" mostrou que era falso: a license é PDA derivada de `[license, cofre, payload_hash]`. Sub-vault[1] só vê licenses que ela mesma criou — não há acesso cross-vault. Sem parametrizar, uma license emitida por sub-vault de TTL longo ficaria presa em emergência se Primary indisponível.

**Estado final — parametrizados (3):** `issue_license`, `revoke_audit`, `emergency_close_license`.
**Estado final — admin hardcoded (5):** `init_cofre`, `set_operator`, `add_signer_view`, `remove_signer_view`, `init_view_distribution`.
**Permission-less (1):** `close_expired_license` (não tem `verify_squads_vault_signer` — anyone pode chamar após TTL).

**Trade-off explícito mantido:** `init_cofre` permanece Primary-only. Sub-vaults podem usar private send / payroll / invoice depois que a cofre estiver inicializada, mas a inicialização exige Primary. Isso já é o caso na prática (cofre init é parte do onboarding do vault).

### 2.3 Alternativa rejeitada: parametrizar todos

Custa 4× mais trabalho, abre vetores de governança, sem ganho de produto. Rejeitado.

---

## 3. Mudanças por camada

### 3.1 Programa — `cloak-gatekeeper`

**Arquivos:**

- `programs/cloak-gatekeeper/src/instructions/issue_license.rs:8-19`
  ```diff
  -pub fn handler(ctx, payload_hash, nonce, ttl_secs) -> Result<()> {
  -    verify_squads_vault_signer(&ctx.accounts.cofre.multisig, 0, &ctx.accounts.squads_vault)?;
  +pub fn handler(ctx, payload_hash, nonce, ttl_secs, vault_index: u8) -> Result<()> {
  +    verify_squads_vault_signer(&ctx.accounts.cofre.multisig, vault_index, &ctx.accounts.squads_vault)?;
  ```

- `programs/cloak-gatekeeper/src/instructions/revoke_audit.rs:7-12` — idem

- `programs/cloak-gatekeeper/src/lib.rs` — adicionar `vault_index: u8` na assinatura pública dos 2 métodos.

- `utils.rs::verify_squads_vault_signer` — **não muda** (já aceita `vault_index: u8`).

**Não muda:** `state.rs` (Cofre/License/ViewKeyDistribution), `events.rs`, `errors.rs`, `execute_with_license.rs` (operator é signer, não vault), `close_expired_license.rs` (sem signer constraint).

### 3.2 Test harness — `cloak-squads-test-harness`

**Arquivos:**

- `programs/cloak-squads-test-harness/src/lib.rs:269-281` — `invoke_with_squads_vault` aceita `vault_index: u8` em vez de hardcoded `[0u8]`.
- `lib.rs:299-315` (`InvokeIssueLicense` accounts) — `seeds = [b"multisig", multisig.as_ref(), b"vault", &[vault_index]]` (precisa receber via `#[instruction(...)]`).
- Mesmo para `InvokeRevokeAudit` (se existir; se não, criar).
- `pub fn invoke_issue_license` / `pub fn invoke_revoke_audit` — adicionar `vault_index: u8` na assinatura.

**Decisão de design:** os outros wrappers (`invoke_init_cofre`, `invoke_set_operator`, etc.) **continuam hardcoded em 0**, porque os handlers que eles chamam continuam exigindo vault[0].

### 3.3 IDL

`apps/web/lib/idl/cloak_gatekeeper.json` — regerado por `anchor build`. Verificar manualmente que `args` de `issue_license` e `revoke_audit` ganharam `vault_index: u8` no final (Anchor preserva ordem). **Não editar manualmente** — copiar de `target/idl/`.

### 3.4 Builders TS

**`apps/web/lib/gatekeeper-instructions.ts:37-75` — `buildIssueLicenseIxBrowser`:**

```diff
 export async function buildIssueLicenseIxBrowser(params: {
   multisig: PublicKey;
   payloadHash: Uint8Array;
   nonce: Uint8Array;
   ttlSecs?: number;
   vaultIndex?: number;
 }) {
   ...
   const vault = squadsVaultPda(params.multisig, squadsProgram, params.vaultIndex)[0];
   ...
   const data = concatBytes(
     discriminator,
     params.payloadHash,
     params.nonce,
     writeI64Le(BigInt(params.ttlSecs ?? 900)),
+    new Uint8Array([params.vaultIndex ?? 0]),
   );
```

**`apps/web/lib/gatekeeper-instructions.ts:158-187` — `buildRevokeAuditIxBrowser`:** mesmo padrão.

**`packages/core/src/gatekeeper-client.ts:6-26` — `buildIssueLicenseIx`:**

```diff
-return issueLicense(Array.from(payloadHash), Array.from(nonce), ttlSecs)
+return issueLicense(Array.from(payloadHash), Array.from(nonce), ttlSecs, vaultIndex ?? 0)
   .accountsPartial({ cofre, payer })
   .instruction();
```

Adicionar `vaultIndex?: number` na assinatura pública.

**`packages/core/src/squads-adapter.ts:10-64` — `buildIssueLicenseProposal`:** já recebe `vaultIndex?` no params; só passa para o ix builder.

### 3.5 Call sites — front-end

| Arquivo | Linha | Mudança |
|---|---|---|
| `apps/web/components/vault/SendModal.tsx` | 453 | `buildIssueLicenseIxBrowser({ ..., vaultIndex: selectedVaultIndex })` |
| `apps/web/app/vault/[multisig]/send/page.tsx` | 411 | idem (precisa ter selector na página) |
| `apps/web/app/vault/[multisig]/payroll/page.tsx` | 423 | passar `vaultIndex` (loop de recipients) |
| `apps/web/app/vault/[multisig]/payroll/page.tsx` | 584, 650 | trocar `vaultIndex: 0` hardcoded pelo state |
| `apps/web/app/vault/[multisig]/invoice/page.tsx` | 275, 312, 327, 369 | idem |
| `apps/web/app/vault/[multisig]/audit/page.tsx` | 289 | `buildRevokeAuditIxBrowser({ ..., vaultIndex })` |

**Atenção:** `vaultIndex` precisa ser passado **consistentemente** para 2 lugares na mesma chamada:

1. O builder do `issue_license` ix (acima) — para a derivação do PDA + para o instruction data.
2. O `createVaultProposal` / `createBatchIssueLicenseProposal` (`apps/web/lib/squads-sdk.ts`) — para a `VaultTransactionCreate.vaultIndex`.

Inconsistência aqui = `InvalidSquadsSigner` (gatekeeper) ou `InvalidAccount` (Squads). Validar com assert antes de mandar.

### 3.6 UI — destravar lock atual

Reverter as mudanças de bloqueio do commit `5aee013`:

- `payroll/page.tsx`: reintroduzir source picker (foi removido).
- `invoice/page.tsx`: reintroduzir source picker (foi removido).
- `SendModal.tsx`: hoje só bloqueia private quando `destType === "account"` — manter esse lock (é o BUG-4, separado).

### 3.7 Persistência de `vaultIndex` no DB

Round 4 do log de validação. Endpoints:

- `POST /api/proposals` (private send) — Zod schema precisa aceitar `vaultIndex: z.number().int().min(0)`.
- `POST /api/payrolls` — idem.
- `POST /api/invoices` — idem.

Sem isso, o draft do operator não tem como reconstruir o ix (na prática hoje o draft persiste o ix completo serializado, mas é defesa em profundidade).

### 3.8 Scripts

`scripts/test-f1-private-send.ts`, `test-f1-private-send-2ofn.ts`, `test-f4-stealth-invoice.ts` — todos buildam ix manualmente com `ixDiscriminator`. Adicionar `vault_index: u8` no buffer (1 byte no final).

`scripts/setup-demo-cofre.ts`, `setup-demo-cofre-2ofn.ts`, `set-operator.ts` — chamam handlers admin (`init_cofre`, `set_operator`). **Não mudam** (admin continua hardcoded em 0).

---

## 4. Sequência de deploy

```
1. anchor build
2. cargo test (test harness ainda funciona com vault[0])
3. pnpm test:int (integração — vão quebrar até call sites atualizarem)
4. Atualizar test harness + integração + IDL
5. pnpm test:int (verde)
6. Atualizar TS builders + call sites
7. pnpm typecheck + pnpm lint
8. anchor deploy --program-id AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq
9. Copiar target/idl/cloak_gatekeeper.json → apps/web/lib/idl/
10. Smoke test devnet: payroll do sub-vault Jetsul (multisig 5hrqq…HpG2)
11. Deploy front-end
```

**Janela de risco:** entre passo 8 (programa novo) e passo 11 (front novo). Bundle antigo em cache vai mandar args sem `vault_index` → `InstructionDidNotDeserialize`. Mitigação: bumper de versão no service worker forçando hard-refresh, ou deploy em horário de baixo uso.

---

## 5. Insights de risco

### 5.1 Discriminator não muda, mas args sim

Anchor calcula discriminator de `global:issue_license` → 8 bytes determinísticos. Adicionar arg **não muda** o discriminator. Cliente velho mandando `[disc, payload, nonce, ttl]` (sem `vault_index`) bate no discriminator certo, falha como `InstructionDidNotDeserialize` — erro genérico, mensagem ruim. Considerar bumper de IDL_VERSION no front pra detectar drift.

### 5.2 Operator funding cross-vault implícito

Operator é financiado pela Primary (`apps/web/app/vault/[multisig]/operator/page.tsx` — auto-funding bundle). Se Jetsul faz payroll, **a Primary paga o gas do operator**. Funcionalmente OK (operator é da multisig, não do vault), mas vira uma transferência cross-vault implícita. Documentar no help do operator.

### 5.3 `Cofre.operator` continua único

Não temos operator-por-vault. License emitida pelo Jetsul é consumida pelo MESMO operator do cofre. Tudo bem — operator é organizacional. Vale notar pra auditoria.

### 5.4 Squads SDK silencioso

O patch em `squads-sdk.ts:481-488` (rebaixar vault PDAs de signer→não-signer no outer ix) **continua sendo necessário** mesmo depois desse fix, porque a SDK do `@sqds/multisig` ainda marca o vault PDA como signer no `accountsForTransactionExecute`. Não confundir as duas coisas: o patch é pra outer message, o fix é pra inner message.

### 5.5 Backwards-compatibility com cofre existente

A `Cofre` account em `5hrqq…HpG2` foi criada antes do fix. Como `state.rs` não muda, ela continua válida. Só os *handlers* mudam.

### 5.6 IDL drift

Esquecer o passo 9 (copiar IDL) = operator não decodifica licenses (`BorshAccountsCoder` em `operator/page.tsx:712`). Tela quebra inteira. Adicionar ao checklist de deploy + idealmente um `pnpm postbuild` script que faz o copy.

---

## 6. Smoke test pós-deploy

Validar no multisig devnet `5hrqqkcaf7Xsx2gR7mFouBSXSGS1jtK1EGwV6NVnHpG2`:

1. **Send privado da Primary** — sanity check, deve continuar funcionando.
2. **Send privado do Jetsul (vault[1])** — proposal cria, aprova, executa, license consumida, fundos chegam ao destinatário.
3. **Payroll do Jetsul** — 2 recipients, executa em batch.
4. **Invoice stealth do Jetsul** — gera link, cliente paga.
5. **Send privado da Primary com destination = Jetsul** — continua bloqueado por BUG-4 (PDA off-curve), erro friendly.
6. **`revoke_audit` do Jetsul** — passa diversifier truncado, vai pro `Cofre.revoked_audit`.

Se 1-6 passam, o fix tá pronto.

---

## 7. Estimativa

| Fase | Tempo |
|---|---|
| Programa + harness + cargo test | 2h |
| anchor build + IDL regen | 30min |
| TS builders + call sites + Zod schemas | 2h |
| Testes de integração ajuste + verde | 2h |
| Deploy devnet + smoke test | 1h |
| **Total** | **~7-8h** |

Não é o "~4h" do log original — esse subestimava o impacto em testes de integração e na sequência de deploy.

---

## 8. Decisão pendente

Antes de implementar, confirmar com stakeholder:

- [ ] Concorda com escopo reduzido (só `issue_license` + `revoke_audit`, admin handlers continuam Primary-only)?
- [ ] OK com janela de risco de bundle-cache durante deploy?
- [ ] Tem 1 dia de devnet pra smoke test antes de mainnet?
