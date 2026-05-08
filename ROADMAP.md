# Aegis Roadmap

## Status atual

**Devnet, feature-complete em Tier 1.** Private send, payroll, stealth invoices (bound + bearer), recurring payments (público + privado), audit links escopados com exports assinados e access log, treasury KPI strip e governance time locks rodam end-to-end em [aegisz.xyz](https://aegisz.xyz).

Autenticação usa session cookie httpOnly (uma assinatura de carteira a cada 30 minutos); UTXO secrets cifrados em repouso; rate limit distribuído via Upstash Redis com fallback in-memory; v1 auth desligada por default. Tema Heraldic (claro + escuro) aplicado em todas as páginas.

| Categoria | Status |
|---|---|
| Privacy stack (Private Send, Payroll, Bound + Bearer Invoices) | ✅ Devnet |
| Recurring Payments (semanal a trimestral, público ou privado) | ✅ Devnet (cron pendente) |
| Audit Links + Access Log + Signed Exports | ✅ Devnet |
| Treasury KPI strip + DB-backed income indexer | ✅ Devnet |
| Governance time locks (Squads native) | ✅ Devnet |
| Sub-vaults first-class (UI + gatekeeper parametrizado) | ✅ Devnet |
| Vault management, settings, address book modal | ✅ Devnet |
| Atomic vault → operator auto-funding | ✅ Devnet |
| Member management via Squads config proposals | ✅ Devnet |
| Tema Heraldic light + dark, WalletMenu rico, Operator console premium | ✅ |

---

## Entregue — Devnet

### Privacy & payments
- [x] **Private Send** via Cloak shield pool (proposal → license → operator → `transact()` → `fullWithdraw()`)
- [x] **Payroll batches** (CSV upload, até 10 recipients, execução por linha)
- [x] **Stealth Invoices bound** — claim links com recipient comprometido na criação
- [x] **Stealth Invoices bearer** — claim links sem recipient; quem abre o link escolhe a wallet de destino no claim. Default 24h de expiração com aviso "bearer cash" na UI
- [x] **Recurring Payments** — schedules semanais, biweekly, mensais, trimestrais; "Run now" cria proposal por ciclo; `nextDueAt` rola sozinho. Público ou privado por schedule
- [x] **Token swaps** SOL ↔ USDC via Jupiter / Raydium dentro do flow padrão de propostas
- [x] **Sub-vaults** parametrizados (`vault_index`) em SDK, gatekeeper runtime, schema Prisma, navegação

### Auditability
- [x] **Audit Links** escopados (`full_history`, `amounts_only`, `time_ranged`), revogáveis, com expiração
- [x] **Audit Access Log** — view e export gravados com IP + timestamp, expostos no admin sob cada link
- [x] **Signed Exports** — CSV e JSON com header Ed25519 (`signedAt | vault | linkId | data`), verificáveis offline
- [x] **Audit fidelity (Sprint A, `176aaad`)** — payroll abre uma linha por recipient; cluster filter aplicado em todas as queries; `VaultIncome`, `StealthInvoice`, `SwapDraft` agregados no feed (proof-of-reserves reconciliável); mock fallback removido do viewer; endpoint canônico `/api/audit/[linkId]/transactions` é fonte única para viewer + signed export; `expiresAt` validado server-side (futuro + ≤365d); `time_ranged` exige `startDate`+`endDate`; cap on-chain `Cofre.MAX_REVOKED=256` exibido no admin com warning ≥80%
- [x] **Treasury KPI strip** — DB-backed income indexer, exclui movimentos intra-tesouraria

### Governance
- [x] **Time locks** via Squads v4 nativo (UI em Settings + execute gate)
- [x] **2-of-N** com `commitmentClaim` público (membros) + secrets sensíveis (operador)
- [x] **Member management** — add/remove, threshold change via config proposals
- [x] **Vault import** de Squads multisigs existentes (devnet)

### Atomic execution
- [x] **Vault → operator auto-funding** numa única execução aprovada (vault transfere o valor + gatekeeper emite license atomicamente)
- [x] **Operator on-curve guard** — rejeita PDAs como destination antes do deposit, exceto em invoice mode

### Plataforma
- [x] **Helius RPC** wired (HTTP + WS), public-devnet fallback removido, batching de leituras de proposals
- [x] **Aegisz.xyz** rebrand
- [x] **Tema Heraldic** light + dark, design tokens, primitives, vocabulário aplicado em todas as feature pages
- [x] **WalletMenu rico** — identidade, balance, network, vault role, theme toggle
- [x] **Operator console** — master/detail, skeleton, history sheet, queue fix, suppressProgress propagation
- [x] **Address book** com modal
- [x] **Legal pages** `/terms` e `/privacy`, footer
- [x] **Auto-reload** no `ChunkLoadError` após deploy
- [x] **Cluster scoping** em DB (vault rows por cluster Solana)
- [x] **Deposit address UX** — desambiguada via Deposit button + receive modal

---

## P0 — Segurança (entregue, monitoramento contínuo)

Todos os bloqueadores S1–S6 originais resolvidos, mais hardening adicional em sprints subsequentes.

### S1–S6 originais
- [x] **S1** — `requireVaultMember` em todos os endpoints de leitura/escrita; dual-auth (member OR audit link) onde aplicável
- [x] **S2** — `requireVaultOperator` guarda `?includeSensitive=true`; non-operators recebem 403
- [x] **S3** — UTXO secrets cifrados em repouso (envelope `v1.{base64}` AES-256-GCM derivado de `JWT_SIGNING_SECRET`)
- [x] **S4** — Challenge-response Redis SET NX EX 120s; Ed25519 verificado antes do consume
- [x] **S5** — Rate limit Redis atômico; perfis `default:30`, `write:10`, `challenge:20`, `signature:60`; composite buckets IP + pubkey; fallback in-memory
- [x] **S6** — Replay protection v2 (`method + path + body_hash`); session cookie httpOnly substitui per-request signing

### Hardening adicional
- [x] **Default-deny v1 auth** — `ALLOW_LEGACY_AUTH=false` por default; v2 obrigatório fora de janela de migração
- [x] **Nonce reservation** wired no rate limit
- [x] **IDOR closures + atomic claims + memo encryption + audit-sign hardening** (`8b4dc7d`)
- [x] **Baseline response headers** — security headers consistentes
- [x] **CSP em Report-Only** — wallet adapters, snarkjs `wasm-unsafe-eval`, `connect-src https: wss:` permitidos; `unsafe-eval` desligado (`1b6be33`)
- [x] **SSRF write-time gate** — `webhookUrl` e `rpcOverride` validados antes de gravar (`b1f67f1`)
- [x] **Fail-loud env** — `pda.ts` lança se `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID` ou `NEXT_PUBLIC_SQUADS_PROGRAM_ID` for base58 inválido
- [x] **Auth obrigatória em `/api/vaults/mine`** + cluster-mismatch RPC fix + memoization
- [x] **Bearer invoice on-curve guard** — operator skipa Ed25519 guard em invoice mode (deposit-only)
- [x] **Per-purpose key split** — `JWT_SIGNING_SECRET` separado em `SESSION_HMAC_KEY`, `FIELD_CRYPTO_KEY`, `AUDIT_EXPORT_SIGN_KEY` (`e8e0349`). Cada subsistema rotaciona sozinho; fallback no JWT preserva deploys antigos
- [x] **Operator deposit cache server-side** — `OperatorDepositCache` table criptografada via `field-crypto`; fechar a aba entre deposit e finalize não drena mais o operador (`5856867`)

### Removido do escopo
Os itens abaixo foram especificados, parcialmente implementados, mas removidos da UI antes de virarem feature pública:

- **Privacy meter (anonymity set UI)** — removido (`dd0556b`). Mantido apenas o cálculo no backend para uso interno.
- **Spending limits UI** — removido (`98ff19c`). Lib `spending-limits.ts` permanece dormente para v2 com privacy bridge.
- **Proof generation state (3-step UI)** — removido (`954b8d5`). Spinner CSS simples no lugar.
- **Proposal simulator** — removido (`069b79a`).

---

## P1 — Tier 2 pendente

### Custom roles
- [ ] DB-overlay permission model (admin / proposer / executor / viewer) — sem mudança on-chain

### Privacy bridge para spending limits
- [ ] Limit-use deposita no Cloak pool em vez de transferência pública
- Depende da parametrização de `vault_index` (já entregue) e de gatekeeper aceitar issue_license originado de `spendingLimitUse`

### Recurring auto-cron
- [ ] Background runner para disparar schedules sem clique manual
- Sub-vault parametrization desbloqueia, falta apenas o runner

### Multi-operator failover
- [ ] Backup operator + heartbeat para queue não congelar com primário offline

### Proof-of-payment exports
- [ ] Export de witness Groth16 para auditor verificar criptograficamente um pagamento específico

---

## P2 — Mainnet readiness

### Infraestrutura
- [x] **RPC dedicado** — Helius (devnet wired; mainnet endpoint pendente)
- [x] **PostgreSQL gerenciado** — Render Postgres em produção
- [ ] **Variáveis de ambiente de produção** — `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`, RPC mainnet com api-key, relay URL Cloak mainnet, `JWT_SIGNING_SECRET` rotacionado
- [ ] **Monitoramento** — alertas para falhas de RPC, relay timeout, latência de proof
- [ ] **`AUDIT_EXPORT_SIGN_KEY` rotation story** + per-vault signing keys

### Cloak mainnet
- [ ] Validar parity da API — `transact()` + `fullWithdraw()` contra programa mainnet
- [ ] Confirmar relay URL de produção com o time Cloak
- [ ] Smoke tests com SOL real antes do launch

### Clustering por rede
- [ ] **Dual-connection** — `mainnetConnection` para vault/proposta, `devnetConnection` para Cloak até validação mainnet
- [x] DB já scoped por cluster (`dd3f15f`)

### Auditoria do programa gatekeeper
- [ ] Auditoria externa do `programs/cloak-gatekeeper` (classe Neodyme / OtterSec) antes de fundos reais
- [ ] Cobrir replay de licença, edge cases de TTL, invariants validation, parametrização de `vault_index`

### 2-of-N hardening
- [ ] Testes regressivos com multisig 2-of-3 (proposta por A, aprovação por B, execução pelo operador)
- [x] Dual-tier de `commitmentClaim` (público para membros, sensível só para operador) já entregue

---

## P3 — UX e produto

### Quick wins
- [ ] **Auto-execute para threshold=1** — pular tela de "aguardando aprovação" em vaults 1-of-1
- [ ] **Ocultar nav do Operador** para wallets que não são operadoras do vault
- [ ] **Real-time status** — Helius webhook ou WebSocket para status de proposta sem polling
- [ ] **Filtros na lista de propostas** — busca por recipient, range de data, status, token
- [ ] **Preview de fee** no painel do operador antes de executar

### SPL tokens
- [ ] **Privacidade para SPL tokens** — estender `transact()` + `fullWithdraw()` para USDC e outros (depende do protocolo Cloak)
- [ ] **Histórico de swaps** persistido (`SwapDraft` já existe, falta surface na UI)

---

## P4 — Ecosystem

### Aegis MCP Server
> "O único MCP server de multisig em Solana com privacidade — agentes propõem, humanos aprovam, nada vaza."

Conecta qualquer agente compatível com MCP (Claude, GPT-4o, Cursor) ao vault Squads+Cloak. Spec `2025-11-25`. Um único `npx -y @aegis/mcp-server` instala; uma assinatura autentica a sessão.

**22 ferramentas em 5 grupos:** Vault (`list_vaults`, `get_vault`, `get_balance`, `get_members`), Proposals (`create_proposal`, `approve_proposal`, `reject_proposal`, `list_proposals`, `get_proposal`), Payroll (`create_payroll_proposal`, `list_payrolls`), Privacy (`create_stealth_invoice`, `get_invoice_status`, `create_audit_link`), Operator (`get_operator_queue`, `execute_next`, `get_execution_status`, `preflight_check`).

**Segurança:** agente nunca executa, só propõe; Elicitation para operações acima de thresholds; session cookie httpOnly reaproveita o auth do app (uma assinatura por sessão); zero acesso a chaves privadas; ZK fica na UI do operador humano.

- [ ] Mover `buildIssueLicenseIxBrowser` para `packages/core/src/` (remover `"use client"`)
- [ ] Implementar MCP server (`apps/mcp-server/`)
- [ ] Publicar `@aegis/mcp-server` no npm
- [ ] Documentação de onboarding no README

### Outras integrações
- [ ] **Streamflow** — vesting e salary streams roteados via Cloak
- [ ] **Sphere** — operator off-ramps de depósitos confirmados para USD
- [ ] **Mobile-first PWA** — claim flow otimizado para mobile wallet adapter + QR
- [ ] **Realms / Governance** via CPI para vaults controlados por DAO
- [ ] **Squads v5** quando lançado

---

## P5 — Arquitetura futura

### Cloak CPI
Se o protocolo Cloak expuser `transact()` chamável por programa (CPI), o gatekeeper poderá depositar diretamente — eliminando o hop do operador. Resultado: `vault → Cloak pool → recipient` sem relay visível on-chain. Tracking com o time Cloak.

### Payloads com time-lock por execução
Emitir license com TTL futuro — operator só executa após bloco específico. Útil para vesting e pagamentos programados (complementa a feature Recurring Payments com garantia on-chain de não-execução antecipada).

### Multi-hop para anonymity sets maiores
`vault → Cloak deposit → Cloak withdraw → novo Cloak deposit → recipient` — aumenta o set para transferências grandes. Depende de suporte no SDK Cloak.

---

## Questões em aberto

- **Operator economics:** Quem abastece a wallet do operador com SOL para fees? O vault auto-funde o valor do pagamento, mas o operador precisa de ~0.05 SOL por execução. Avaliar fee pequeno embutido ou modelo de operador como membro designado.
- **Key recovery:** Se a wallet do operador for perdida entre a emissão da license (TTL 15 min) e a execução, a proposta precisa ser re-executada com novo voto Squads. Documentar procedimento de rotação de emergência.
- **Anonymity set em produção:** No devnet o pool Cloak tem atividade limitada. Avaliar profundidade do pool mainnet antes de afirmar privacidade de nível produção.
- **Jurisdição de compliance:** Como audit links interagem com requisitos regulatórios por jurisdição? Os controles de scope foram projetados com isso em mente, mas precisam de revisão legal.
- **AUDIT_EXPORT_SIGN_KEY rotation:** Hoje cai em fallback derivado de `JWT_SIGNING_SECRET`. Para mainnet precisa de chave dedicada e estratégia de rotação sem invalidar exports antigos.
