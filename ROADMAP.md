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

### S1 — Membership check em todos os endpoints
**Problema:** `requireWalletAuth` verifica apenas a assinatura criptográfica, mas não confere se a wallet é membro do multisig. Qualquer wallet autenticada pode criar drafts em vaults de terceiros.  
**Fix:** Injetar `requireVaultMember(cofreAddress)` em todos os POSTs que criam dados associados a um vault.

### S2 — Gate de operador para dados sensíveis
**Problema:** O parâmetro `?includeSensitive=true` em `/api/proposals/[ms]/[index]` retorna `commitmentClaim` (chave privada do UTXO) para qualquer wallet autenticada.  
**Fix:** Apenas a wallet registrada como operador do Cofre pode acessar dados sensíveis. Verificar contra o campo `operator` do Cofre on-chain.

### S3 — Cifrar UTXO secrets no banco
**Problema:** `StealthInvoice` armazena `utxoPrivateKey` e `utxoBlinding` em texto claro no PostgreSQL.  
**Fix:** Cifrar com AES-256-GCM usando uma chave derivada do `JWT_SIGNING_SECRET`. Descriptografar apenas no momento de entrega ao operador autenticado.

### S4 — Challenge-response no claim de stealth invoices
**Problema:** A chave privada do UTXO (`#sk=...`) fica no fragment da URL do claim link. Se o backend loggar a requisição, ela fica exposta.  
**Fix:** Implementar challenge-response: recipient assina um nonce de 60s com a chave do claim; backend valida a assinatura antes de retornar os dados do UTXO.

### S5 — Rate limiting distribuído
**Problema:** Rate limiting atual é in-memory por processo. Em multi-instance (Render, Fly.io), o limite não é compartilhado. Sem eviction, pode causar leak de memória.  
**Fix:** Migrar para Redis (Upstash) — `REDIS_URL` já está no `.env.example`, só falta a implementação.

### S6 — Replay protection por endpoint
**Problema:** O header `X-Signature` é válido por 5 minutos em qualquer endpoint. Uma signature capturada pode ser reutilizada em endpoints diferentes durante a janela.  
**Fix:** Incluir `method + path + body_hash` no payload assinado, verificar no servidor.

---

## P1 — Mainnet readiness

### Infraestrutura
- [ ] **RPC dedicado** — Helius ou QuickNode (o endpoint público é rate-limited para `getProgramAccounts`)
- [ ] **PostgreSQL gerenciado** — Render Postgres ou Supabase em produção
- [ ] **Variáveis de ambiente de produção** — `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`, relay URL do Cloak mainnet
- [ ] **Monitoramento** — alertas para falhas de RPC, relay Cloak timeout, latência de proof

### Cloak mainnet
- [ ] Validar parity da API — `transact()` + `fullWithdraw()` contra o programa mainnet do Cloak
- [ ] Confirmar relay URL de produção com o time Cloak
- [ ] Smoke tests com SOL real antes do launch

### Clustering por rede
- [ ] **Dual-connection** — `mainnetConnection` para ler dados do vault/proposta, `devnetConnection` para operações Cloak até a validação do programa mainnet
- [ ] Vault discovery funciona em mainnet; o bloqueio atual é o dashboard ler do cluster errado após o import

### Hardening 2-of-N
- [ ] `commitmentClaim` armazenado apenas no `sessionStorage` do proposer — co-signers não conseguem verificar o commitment antes de aprovar
- [ ] **Fix:** mover o `commitmentClaim` para o banco (cifrado), acessível a todos os membros do vault autenticados
- [ ] Testes regressivos com multisig 2-of-3 (proposta por A, aprovação por B, execução pelo operador)

### Auditoria do programa gatekeeper
- [ ] Auditoria externa do `programs/cloak-gatekeeper` antes de qualquer uso com fundos reais
- [ ] Cobrir especificamente: replay de licença, edge cases de TTL, invariants validation

---

## P2 — UX e features pendentes

### UX / Produto
- [ ] **Auto-execute para threshold=1** — pular tela de "aguardando aprovação" em vaults 1-of-1
- [ ] **Ocultar nav do Operador** para wallets que não são operadoras do vault
- [ ] **Real-time status** — Helius webhook ou WebSocket para atualizar status de proposta sem polling
- [ ] **Filtros na lista de propostas** — busca por recipient, range de data, status, token
- [ ] **Preview de fee** no painel do operador antes de executar
- [ ] **Worker para execução ZK** — a prova ZK (~30s) trava o frontend; mover para Service Worker ou Web Worker

### SPL tokens e swaps
- [ ] **Privacidade para SPL tokens** — estender `transact()` + `fullWithdraw()` para USDC e outros tokens (dependente de suporte do protocolo Cloak)
- [ ] **Histórico de swaps** na tela `/swap` usando o `SwapDraft` persistido no banco

### Gerenciamento de equipe
- [ ] **Permissões por role** — viewer, proposer, approver, operador
- [ ] **Invite links** para adicionar novos membros com fluxo guiado
- [ ] **Notificações** — webhook e email para propostas criadas, aprovadas, executadas

### Integrações
- [ ] **Aegis MCP server** — expor operações de vault para agentes de IA: checar saldo, criar proposta, executar fila do operador (com human-in-the-loop)
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
