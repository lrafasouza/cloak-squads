# Aegis Roadmap

## Status atual — Devnet funcional

Todas as features principais estão funcionando end-to-end em devnet:

| Feature | Status |
|---------|--------|
| F1 — Private Send | ✅ Funcional |
| F2 — Payroll batch (até 10 recipients) | ✅ Funcional |
| F3 — Audit links escopados | ✅ Funcional |
| F4 — Stealth invoices com claim links | ✅ Funcional |
| F5 — Token swap proposals (SOL ↔ USDC) | ✅ Funcional |
| Vault management, settings, address book | ✅ Funcional |
| Atomic vault → operator auto-funding | ✅ Funcional |
| Member management via Squads config proposals | ✅ Funcional |

---

## P0 — Segurança (bloqueadores para produção)

Estes itens bloqueiam qualquer deploy em mainnet ou uso com usuários reais.

### S1 — Membership check em todos os endpoints ✅
~~**Problema:** `requireWalletAuth` verifica apenas a assinatura criptográfica, mas não confere se a wallet é membro do multisig. Qualquer wallet autenticada pode criar drafts em vaults de terceiros.~~  
**Implementado:** `requireVaultMember(cofreAddress)` injetado em todos os endpoints de leitura e escrita de dados de vault. Endpoints de proposals e payrolls têm dual-auth (membership OR audit link válido). `verifyAuditLinkAccess` centralizado em `vault-membership.ts`. GET `/api/vaults/[multisig]` entrega `settings` somente para membros autenticados.

### S2 — Gate de operador para dados sensíveis ✅
~~**Problema:** O parâmetro `?includeSensitive=true` em `/api/proposals/[ms]/[index]` retorna `commitmentClaim` (chave privada do UTXO) para qualquer wallet autenticada.~~  
**Implementado:** `requireVaultOperator(multisig)` guarda `?includeSensitive=true`; wallets não-operadoras recebem 403.

### S3 — Cifrar UTXO secrets no banco ✅
~~**Problema:** `StealthInvoice` armazena `utxoPrivateKey` e `utxoBlinding` em texto claro no PostgreSQL.~~  
**Implementado:** Envelope versionado `v1.{base64}` com AES-256-GCM derivado do `JWT_SIGNING_SECRET`. `decryptField` aceita legacy e v1. Descriptografia ocorre apenas na entrega ao operador autenticado.

### S4 — Challenge-response no claim de stealth invoices ✅
~~**Problema:** A chave privada do UTXO (`#sk=...`) fica no fragment da URL do claim link. Se o backend loggar a requisição, ela fica exposta.~~  
**Implementado:** Redis SET NX EX 120s — challenge consumido uma única vez. Ed25519 verificado antes de consumir o challenge (evita burn de challenge por assinatura inválida).

### S5 — Rate limiting distribuído ✅
~~**Problema:** Rate limiting atual é in-memory por processo. Em multi-instance (Render, Fly.io), o limite não é compartilhado. Sem eviction, pode causar leak de memória.~~  
**Implementado:** Redis atômico SET NX EX; perfis `default:30`, `write:10`, `challenge:20`, `signature:60`; composite buckets por IP + pubkey; fallback in-memory sem Redis.

### S6 — Replay protection por endpoint ✅
~~**Problema:** O header `X-Signature` é válido por 5 minutos em qualquer endpoint. Uma signature capturada pode ser reutilizada em endpoints diferentes durante a janela.~~  
**Implementado:** Payload v2 inclui `method + path + body_hash`; `verifyWalletAuthHeaders` valida binding. Session cookie httpOnly substitui assinatura por request em clients atualizados.

---

## P1 — Mainnet readiness

### Infraestrutura
- [ ] **RPC dedicado** — Helius ou QuickNode (o endpoint público é rate-limited para `getProgramAccounts`)
- [x] **PostgreSQL gerenciado** — Render Postgres em produção
- [ ] **Variáveis de ambiente de produção** — `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`, relay URL do Cloak mainnet
- [ ] **Monitoramento** — alertas para falhas de RPC, relay Cloak timeout, latência de proof

### Cloak mainnet
- [ ] Validar parity da API — `transact()` + `fullWithdraw()` contra o programa mainnet do Cloak
- [ ] Confirmar relay URL de produção com o time Cloak
- [ ] Smoke tests com SOL real antes do launch

### Clustering por rede
- [ ] **Dual-connection** — `mainnetConnection` para ler dados do vault/proposta, `devnetConnection` para operações Cloak até a validação do programa mainnet
- [ ] Vault discovery funciona em mainnet; o bloqueio atual é o dashboard ler do cluster errado após o import

### Hardening 2-of-N ✅
~~`commitmentClaim` armazenado apenas no `sessionStorage` do proposer — co-signers não conseguem verificar o commitment antes de aprovar~~  
**Implementado:** Dual-tier — GET padrão entrega `commitmentClaim` público do banco (commitment, amount, recipient_vk) a qualquer membro autenticado; `?includeSensitive=true` exige `requireVaultOperator` e retorna secrets completos para UTXO reconstruction.  
- [ ] Testes regressivos com multisig 2-of-3 (proposta por A, aprovação por B, execução pelo operador)

### Auditoria do programa gatekeeper
- [ ] Auditoria externa do `programs/cloak-gatekeeper` antes de qualquer uso com fundos reais
- [ ] Cobrir especificamente: replay de licença, edge cases de TTL, invariants validation

---

## P2 — UX e features pendentes

### Squads parity + Privacy depth ✅ (concluído 2026-05-05)

Pacote de 4 features implementadas para fechar o gap de migração com Squads.so e aprofundar a track Cloak/Frontier:

#### Sub-vaults (`vault_index` 0/1/2…) ✅
- [x] `vaultIndex` parametrizado em `lib/squads-sdk.ts`, `packages/core/src/pda.ts`, `gatekeeper-instructions.ts` — sem hardcode `index: 0`
- [x] Modelo Prisma `SubVault { cofreAddress, vaultIndex, name, color, icon }` + migration
- [x] `vaultIndex Int @default(0)` em `ProposalDraft`, `PayrollDraft`, `StealthInvoice`, `SwapDraft`
- [x] Página `/vault/[ms]/sub-vaults` — lista, cria (com PDA derivada), deleta sub-vaults
- [x] APIs REST GET/POST PATCH/DELETE em `/api/vaults/[multisig]/sub-vaults/[vaultIndex]`

#### Encrypted memos ✅
- [x] `packages/core/src/memo-crypto.ts` — `encryptMemo` / `decryptMemo` via NaCl box (Curve25519 + XSalsa20-Poly1305)
- [x] Migration: `ProposalDraft` ganha `memoCiphertext`, `memoNonce`, `memoEphemeralPk` (Bytes nullable)
- [x] `SendModal`: generates ephemeral box keypair, stores `memoBoxSk` em `commitmentClaim`, sends ciphertext fields
- [x] Operator page: decrypts memo com `memoBoxSk` do `commitmentClaim`; fallback `[encrypted]`
- [x] `SENSITIVE_CLAIM_FIELDS` inclui `memoBoxSk` — não exposto para membros não-operadores

#### Privacy meter (anonymity set UI) ✅
- [x] `lib/cloak-anonymity.ts` — `readMerkleTreeState.nextIndex` = anonymity set; pool depth via `getBalance(vaultAuthority)`
- [x] `/api/cloak/pool-stats` com cache in-memory 60s, retorna `anonymitySetTotal`, `poolDepthLamports`, `riskScore`
- [x] Componente `<PrivacyMeter />` — badge low/medium/high, barra de anonymity set, pool depth em SOL
- [x] Integrado em `SendModal` (modo private + SOL) e página educativa `/vault/[ms]/privacy`
- [x] Threat model honesto: "vault→operator é público; recipient withdraw quebra o link"

#### Spending limits ✅
- [x] `lib/spending-limits.ts`: `createAddSpendingLimitProposal`, `createRemoveSpendingLimitProposal` (configTx governance), `buildSpendingLimitUseIx` (direct 1-sign send)
- [x] Modelo Prisma `SpendingLimit` + migration
- [x] Página `/vault/[ms]/limits` — lista, cria, remove spending limits via proposal
- [x] APIs GET/POST/DELETE em `/api/vaults/[multisig]/spending-limits`
- [x] `SendModal`: detecta limit aplicável → toggle "Use spending limit (skip approval)" → envia direto via `spendingLimitUse`
- [x] Privacy bridge (`spendingLimitUse → Cloak pool`) marcado como follow-up v2

### UX / Produto
- [ ] **Auto-execute para threshold=1** — pular tela de "aguardando aprovação" em vaults 1-of-1
- [ ] **Ocultar nav do Operador** para wallets que não são operadoras do vault
- [ ] **Real-time status** — Helius webhook ou WebSocket para atualizar status de proposta sem polling
- [ ] **Filtros na lista de propostas** — busca por recipient, range de data, status, token
- [ ] **Preview de fee** no painel do operador antes de executar
- [x] **UX da prova ZK** — `prefetchCircuits()` no mount (salva 5–10s); `useUnloadGuard` bloqueia fechar aba; `ProofGenerationState` com 3 etapas integrado ao `TransactionModal`; spinner CSS puro (`animate-spin`) que continua no compositor thread mesmo com JS bloqueado; `getProofStep()` mapeia callbacks do SDK para a etapa correta. True Web Worker requer que o Cloak SDK exponha `groth16.prove` separado do `signTransaction` — deferred até suporte no SDK.

### SPL tokens e swaps
- [ ] **Privacidade para SPL tokens** — estender `transact()` + `fullWithdraw()` para USDC e outros tokens (dependente de suporte do protocolo Cloak)
- [ ] **Histórico de swaps** na tela `/swap` usando o `SwapDraft` persistido no banco

### Gerenciamento de equipe
- [ ] **Permissões por role** — viewer, proposer, approver, operador
- [ ] **Invite links** para adicionar novos membros com fluxo guiado
- [ ] **Notificações** — webhook e email para propostas criadas, aprovadas, executadas

### Integrações

#### Aegis MCP Server — Gerenciamento de tesouro por IA com privacidade nativa

> **"O único MCP server de multisig em Solana com privacidade — agentes propõem, humanos aprovam, nada vaza."**

O **Aegis MCP Server** conecta qualquer agente de IA (Claude, GPT-4o, Cursor, qualquer host compatível com MCP) ao seu vault Squads+Cloak via **Model Context Protocol** (spec `2025-11-25`). Um único comando instala; uma única assinatura de carteira autentica a sessão inteira.

```bash
npx -y @aegis/mcp-server
```

**Por que importa — e por que não existe nada igual:**

| Capacidade | Aegis MCP | squads-mcp (concorrente) |
|---|---|---|
| Proposta de pagamento | ✅ SOL + USDC | ✅ |
| Privacidade on-chain | ✅ `issue_license` via Cloak gatekeeper | ❌ |
| Stealth invoices | ✅ criptografia NaCl (Diffie-Hellman) | ❌ |
| Audit links escopados | ✅ full / amounts_only / time_ranged | ❌ |
| Human-in-the-loop (Elicitation) | ✅ confirma acima de thresholds | ❌ |
| Auth por sessão (sem popup a cada request) | ✅ cookie httpOnly 30 min | ❌ |

**22 ferramentas em 5 grupos:**

1. **Vault** — `list_vaults`, `get_vault`, `get_balance`, `get_members`
2. **Proposals** — `create_proposal`, `approve_proposal`, `reject_proposal`, `list_proposals`, `get_proposal`
3. **Payroll** — `create_payroll_proposal`, `list_payrolls`
4. **Privacy** — `create_stealth_invoice`, `get_invoice_status`, `create_audit_link`
5. **Operator** — `get_operator_queue`, `execute_next`, `get_execution_status`, `preflight_check`

**O que um agente pode fazer com Aegis:**

- _"Pague o salário de outubro para os 8 contribuidores do vault `X` usando os drafts aprovados"_ → agente cria payroll, aguarda aprovação humana via Elicitation, operador executa
- _"Gere um stealth invoice de 500 USDC para a wallet `Y` e me dê o link de claim"_ → criptografia Diffie-Hellman, link opaco, sem rastro de destinatário on-chain
- _"Crie um audit link dos últimos 30 dias, só valores, para o contador"_ → `amounts_only` + `time_ranged`, sem expor endereços nem memos
- _"Cheque o saldo do vault e proponha um swap SOL→USDC se cair abaixo de 10 SOL"_ → pipeline autônoma com aprovação humana como gate

**Arquitetura de segurança:**
- Agente NUNCA executa — só propõe e consulta. Execução exige operador humano autenticado.
- **Elicitation** bloqueia o agente e pede confirmação explícita do usuário para operações acima de 0.1 SOL, payrolls com 5+ destinatários, ou swaps acima de 1 SOL.
- Session cookie httpOnly: a carteira assina **uma vez** na inicialização; todos os requests seguintes usam o cookie automaticamente — sem `signMessage` a cada chamada.
- Sem acesso a chaves privadas. Sem execução de transações Cloak (ZK permanece na UI do operador).

- [ ] Mover `buildIssueLicenseIxBrowser` para `packages/core/src/` (remover `"use client"`)
- [ ] Implementar MCP server (`apps/mcp-server/`)
- [ ] Publicar `@aegis/mcp-server` no npm
- [ ] Documentação de onboarding no README

#### Outras integrações
- [ ] **Realms / Governance** — integração via CPI para vaults controlados por DAO
- [ ] **Squads v5** — compatibilidade quando lançado

---

## P3 — Arquitetura futura

### Cloak CPI
Se o protocolo Cloak expuser uma instrução de depósito que pode ser assinada por programa (CPI), o gatekeeper poderá chamar diretamente o `transact()` a partir da execução do vault — eliminando o hop intermediário do operador.  
**Resultado:** `vault → Cloak pool → recipient` sem nenhum relay visível on-chain.  
**Status:** Tracking com o time Cloak.

### Payloads com time-lock
Emitir licença com TTL futuro — o operador só pode executar após um bloco específico. Útil para vesting schedules e pagamentos programados.

### Multi-hop para sets de anonimato maiores
`vault → Cloak deposit → Cloak withdraw → novo Cloak deposit → recipient` — aumenta o set de anonimato para transferências grandes. Dependente de suporte no SDK Cloak.

---

## Questões em aberto

- **Operator economics:** Quem abastece a wallet do operador com SOL para fees? O vault auto-funde o valor do pagamento, mas o operador precisa de ~0.05 SOL por execução para fees. Avaliar protocolo de fee pequeno ou modelo de operador como membro designado da equipe.
- **Key recovery:** Se a wallet do operador for perdida entre a emissão da licença (TTL 15 min) e a execução, a proposta precisa ser re-executada com um novo voto Squads. Documentar procedimento de rotação de emergência.
- **Anonymity set em produção:** No devnet, o pool Cloak tem atividade limitada — sets de anonimato pequenos. Precisa avaliar a profundidade do pool mainnet antes de afirmar privacidade de nível produção.
- **Jurisdição de compliance:** Como os audit links interagem com requisitos regulatórios por jurisdição? Os controles de scope (`amounts_only`, `time_ranged`) foram projetados com isso em mente, mas precisam de revisão legal.
