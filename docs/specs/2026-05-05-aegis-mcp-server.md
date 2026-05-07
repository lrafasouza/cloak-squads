# Spec: Aegis MCP Server

**Data:** 2026-05-05
**Última revisão:** 2026-05-05 (v2 — após code audit honesto sobre Cloak + nova auth via session cookie)
**Status:** Draft → para implementação após aprovação
**Owner:** TBD
**Pacote:** `@aegis/mcp-server`
**Versão alvo v1:** `0.1.0`

---

## 0. Executive summary

Construir um servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io) que expõe a infraestrutura Aegis (Squads multisig + Cloak gatekeeper + stealth invoices + audit links) como tools chamáveis por LLMs.

**Posicionamento honesto** *(corrigido após audit técnico):* o Aegis MCP é o **único** MCP server Solana que combina (1) Squads multisig + (2) preparação de license issuance no programa Aegis gatekeeper + (3) stealth invoices via NaCl boxes + (4) audit links escopados, todos atrás do gate "agent propõe, humano aprova, operator executa".

**Importante:** o MCP **NÃO gera ZK proofs**, **NÃO chama o Cloak SDK**, e **NÃO efetiva privacy on-chain sozinho**. A privacy real (Cloak shielded transfer com Groth16) só é executada via UI do operator humano, exatamente como o frontend `/send` page faz hoje. O MCP prepara os **payloads** que o operator depois executará — mesmo modelo do frontend.

**A privacy criptográfica que o MCP entrega sozinho** é via stealth invoices (NaCl box keypair + claim links com fragment `#sk=`). Aí sim, sem ZK, sem operator: privacy clássica de chave pública por endereço descartável.

**Esforço:** 5–7 dias para v1 + 2–3 dias para distribuição/listing.

---

## 1. Contexto: estado da arte (Q4 2025)

### 1.1 MCP é o protocolo padrão de tool-use

O [Model Context Protocol](https://modelcontextprotocol.io) é o padrão Anthropic adotado por Claude Desktop, Claude Code, Cursor, Continue, OpenAI Apps SDK e dezenas de outros clientes. Spec atual `2025-11-25`. SDK oficial TypeScript ([`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)) cobre as três primitivas:

| Primitiva | Quem invoca | Caso de uso no Aegis |
|---|---|---|
| **Tool** | LLM decide chamar | "list_proposals", "propose_payment" |
| **Resource** | Cliente busca explicitamente | `vault://Cofre7xR.../members` |
| **Prompt** | User seleciona via UI | "weekly-treasury-snapshot" |

### 1.2 Solana MCPs já existentes

| Servidor | Foco | Multisig? | Privacy preparada? | Stealth/Audit? |
|---|---|:---:|:---:|:---:|
| [`sendaifun/solana-mcp`](https://github.com/sendaifun/solana-mcp) | Solana Agent Kit (60+ ações DeFi/NFT) | ❌ | ❌ | ❌ |
| [`dorkydhruv/squads-mcp`](https://github.com/dorkydhruv/squads-mcp) | **Squads multisig** | ✅ | ❌ | ❌ |
| [`aldrin-labs/solana-mcp`](https://www.pulsemcp.com/servers/aldrin-labs-solana) | RPC queries | ❌ | ❌ | ❌ |
| [`Chainstack`](https://docs.chainstack.com/docs/solana-mcp-server) | RPC + auth | ❌ | ❌ | ❌ |

**Concorrente direto:** `squads-mcp` ([npm](https://www.npmjs.com/package/squads-mcp)) cobre Squads vanilla com 16 tools. Sem privacy preparada, sem stealth, sem audit.

### 1.3 Diferencial real do Aegis MCP

1. **Aegis Gatekeeper license issuance** — `propose_payment` cria license no programa próprio do Aegis (TTL ~15 min, replay-resistant, payload-bound). `squads-mcp` faz `TRANSFER_SOL_FROM_VAULT` direto, sem audit trail nem TTL.

2. **Stealth invoices reais** (privacy nativa, sem ZK) — `create_invoice` gera `nacl.box.keyPair()` + claim link com `#sk=` no fragment. Recipient resgata sem expor wallet. **Esta é privacidade criptográfica completa que o MCP entrega sozinho** — Diffie-Hellman + symmetric encryption clássico, sem Groth16.

3. **Audit links escopados** — `full` / `amounts_only` / `time_ranged` para compliance. `squads-mcp` não tem.

4. **Operator separation** — agent não executa. A própria ausência de `execute_with_license` no MCP é uma feature de safety: agent prompt-injetado não move fundos.

5. **S1-S6 hardening** — auth via session cookie (recém-implementado) + S1 vault membership + S2 operator gate + S3 encryption-at-rest + S4 challenge-response + S5 distributed rate-limit + S6 endpoint-bound sigs (legacy). `squads-mcp` é trivial-auth.

### 1.4 Padrões obrigatórios de MCP server moderno

- **Stdio transport** para local (Claude Desktop, CLIs). Streamable HTTP para remote (futuro).
- **Zod schemas obrigatórias** em todo input.
- **Nunca `console.log` em stdio** — escreve no protocolo. Use `console.error` (vai pra stderr).
- **Elicitation** (spec `2025-06-18`): server pode pedir input/confirmação ao usuário durante a tool call. Crítico para confirmar pagamentos.
- **OAuth 2.1 Resource Server** para HTTP remoto. Para v1 (stdio local) usamos chaves locais com explicit user action.
- **Logs auditáveis**: cada tool call grava em arquivo local + DB Aegis.

---

## 2. Princípios de design

1. **Agent propõe, humano aprova, operator executa.** O MCP **nunca** executa transações que movem fundos sem aprovação da multisig + execução do operator.

2. **MCP NÃO usa Cloak SDK diretamente.** Não gera ZK proofs. Não chama `transact()`. Não move SOL para shielded pool. Prepara payloads (commitment + license + Squads proposal) que o operator UI executará depois — exatamente como `/send` page do frontend faz hoje.

3. **Privacy via NaCl em invoices, privacy via fluxo Aegis em pagamentos.** Stealth invoices = privacy completa via NaCl boxes. Private payments = privacy efetivada quando operator executa o fluxo Cloak via UI.

4. **Read-heavy by default.** A maioria das tools é leitura.

5. **Default privado em pagamentos.** Pagamentos são sempre `kind: "private"` (= license issuance pelo gatekeeper) a menos que user explicitamente peça `kind: "public"`.

6. **Operator NUNCA exposto.** Tools como `execute_with_license`, `cloak_deposit`, `register_operator` **não** entram no v1. Execução é UI-only.

7. **Zero novos secrets.** Reaproveita 100% as primitivas S1-S6 + nova session cookie auth do servidor: o MCP é cliente HTTP do API existente.

8. **Stdio first, HTTP later.** v1 = stdio. v0.3 (futuro) = remote HTTP com OAuth 2.1.

---

## 3. Arquitetura

### 3.1 Topologia

```
┌──────────────────────────┐         ┌─────────────────────────────────┐
│ MCP Client               │         │ Aegis MCP Server (this package) │
│ (Claude Desktop / Code / │  stdio  │                                 │
│  Cursor / Continue)      │ ──────► │ - tool registration             │
│                          │         │ - zod input validation          │
│                          │         │ - login → session cookie cache  │
│                          │         │ - HTTP calls with cookie        │
└──────────────────────────┘         └────────────┬────────────────────┘
                                                  │ HTTPS
                                                  │ (existing API)
                                                  ▼
                                  ┌──────────────────────────────────┐
                                  │ Aegis web app (apps/web)         │
                                  │ - Next.js routes (REST)          │
                                  │ - Postgres + Solana RPC          │
                                  │ - Cloak SDK only in operator UI  │
                                  └──────────────────────────────────┘
```

### 3.2 Localização no monorepo

```
cloak-squads/
├── apps/web/              # already exists
├── packages/
│   ├── core/              # already exists
│   └── aegis-mcp/         # NEW
│       ├── src/
│       │   ├── server.ts          # MCP server bootstrap
│       │   ├── auth.ts            # local keypair load + session login flow
│       │   ├── api-client.ts      # fetch wrapper with cookie jar
│       │   ├── tools/
│       │   │   ├── read/
│       │   │   ├── propose/
│       │   │   ├── vote/
│       │   │   ├── invoice/
│       │   │   └── audit/
│       │   ├── resources/
│       │   ├── prompts/
│       │   └── elicitation.ts
│       ├── bin/
│       │   └── aegis-mcp.ts       # entry point
│       ├── package.json
│       └── README.md
```

### 3.3 Dependências

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0",
    "zod": "^3.25.0",
    "@solana/web3.js": "^1.95.0",
    "@sqds/multisig": "^4.0.0",
    "@cloak-squads/core": "workspace:*",
    "tweetnacl": "^1.0.3",
    "bs58": "^6.0.0",
    "tough-cookie": "^4.1.4"
  }
}
```

**Não importamos** `@cloak.dev/sdk-devnet` no MCP — não precisamos. Reuso de `@cloak-squads/core` para utilities Anchor-puras (PDA, hashing).

---

## 4. Auth model (atualizado para session cookie)

### 4.1 Fluxo de auth

O servidor web Aegis acabou de migrar para **session cookie httpOnly** (`apps/web/lib/auth-session.ts`):

1. Cliente envia `POST /api/auth/login` com signature `aegis:session:{pubkey}:{ts}:{nonce}`.
2. Servidor verifica + emite cookie `aegis-session` (HMAC, TTL 30 min).
3. Requests subsequentes mandam só o cookie.

O MCP server replica esse fluxo:

```
ON STARTUP:
  read AEGIS_KEYPAIR_PATH (Solana keypair JSON)
  cache: pubkey + secretKey

ON FIRST API CALL (lazy):
  generate aegis:session:{pubkey}:{ts}:{uuid} message
  sign with cached secretKey (Ed25519)
  POST /api/auth/login
  store Set-Cookie aegis-session in cookie jar
  
ON SUBSEQUENT CALLS:
  attach cookie automatically (tough-cookie jar)
  
ON 401 (cookie expired/invalidated):
  clear cookie
  re-login
  retry once
```

### 4.2 Configuração do user

User configura **3 variáveis de ambiente** no MCP host:

```json
{
  "mcpServers": {
    "aegis": {
      "command": "npx",
      "args": ["-y", "@aegis/mcp-server"],
      "env": {
        "AEGIS_API_URL": "https://aegisz.xyz",
        "AEGIS_KEYPAIR_PATH": "/Users/me/.aegis/proposer.json",
        "AEGIS_DEFAULT_VAULT": "Cofre7xR8m..."
      }
    }
  }
}
```

| Var | Obrigatório | Descrição |
|---|---|---|
| `AEGIS_API_URL` | sim | URL do app web Aegis. Default: `https://aegisz.xyz`. |
| `AEGIS_KEYPAIR_PATH` | sim | Caminho de arquivo JSON `[byte, byte, ...]` (formato `solana-keygen`). |
| `AEGIS_DEFAULT_VAULT` | não | Cofre default. Tools sem `vault` arg usam este. |
| `AEGIS_NETWORK` | não | `mainnet` \| `devnet`. Default: `devnet`. |
| `AEGIS_RPC_URL` | não | RPC override. Default: `https://api.devnet.solana.com`. |
| `AEGIS_LOG_FILE` | não | Path para audit log local. Default: `~/.aegis/mcp.log`. |

### 4.3 Permissões da chave

A chave do MCP só pode:
- Ler tudo de vaults onde ela é membro (S1)
- Criar drafts de proposals (não move fundos sozinha)
- Votar nos próprios drafts (1 de N votos)
- Criar invoices
- Criar audit links

**Não** pode:
- Executar transações sozinha (precisa N votos + operator)
- Acessar UTXO secrets (S2: operator-only)
- Modificar threshold/members (precisa proposal aprovado)

Pior cenário sob prompt injection: "criou proposal lixo que humanos rejeitam." Nada move sem N approvals reais + execução do operator.

### 4.4 Elicitation (human-in-the-loop)

Para tools sensíveis, o servidor invoca [elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation):

```ts
const confirmed = await server.elicitation.request({
  message: `Confirm: propose 0.5 SOL → ${recipient}? (memo: "${memo}")`,
  schema: z.object({ confirm: z.literal("yes") }),
});
if (confirmed.confirm !== "yes") return { error: "User declined." };
```

User confirma "yes" no Claude Desktop UI antes da tool executar.

---

## 5. Tools (catálogo v1)

Nomenclatura: `aegis.<group>.<verb>`.

### 5.1 Read tools

| Tool | Input | Output |
|---|---|---|
| `aegis.list_vaults` | `{ ownedOnly?: boolean }` | `Vault[]` |
| `aegis.get_vault_info` | `{ vault: string }` | `{ name, threshold, members[], operator, ... }` |
| `aegis.get_vault_balance` | `{ vault: string }` | `{ sol: bigint, tokens: { mint, amount, symbol }[] }` |
| `aegis.list_proposals` | `{ vault?, status?, limit? }` | `Proposal[]` |
| `aegis.get_proposal` | `{ vault: string, index: number }` | `Proposal` (com public claim — sem secrets) |
| `aegis.list_members` | `{ vault: string }` | `{ pubkey, role, addedAt }[]` |
| `aegis.list_invoices` | `{ vault: string, status? }` | `Invoice[]` |
| `aegis.list_audit_links` | `{ vault: string }` | `AuditLink[]` |
| `aegis.get_address_book` | `{ ownerPubkey?: string }` | `{ label, address, notes }[]` |
| `aegis.resolve_recipient` | `{ query: string }` | `{ resolved: string, source: "label"\|"address"\|"none" }` |

### 5.2 Propose tools

**IMPORTANTE: estas tools NÃO geram ZK proofs nem chamam Cloak SDK.** Elas criam license payloads no programa Aegis Gatekeeper + Squads proposals. A privacy efetivada vem na execução pelo operator (UI separada).

| Tool | Input | Side effect |
|---|---|---|
| `aegis.propose_payment` | `{ vault, recipient, amount, memo?, kind?: "private"\|"public" }` | Default `private` → cria license issuance no Aegis gatekeeper + Squads proposal. **Sem ZK.** Operator UI executará Cloak depois. |
| `aegis.propose_payroll` | `{ vault, recipients: [...], mode?: "direct"\|"invoice" }` | Batch até 10. Mesma lógica: prepara N licenses. |
| `aegis.propose_swap` | `{ vault, inputMint, outputMint, inputAmount, slippageBps? }` | Jupiter quote + Squads proposal (público, sem privacy). |
| `aegis.propose_member_add` | `{ vault, newMember, permissions? }` | Squads config proposal. |
| `aegis.propose_member_remove` | `{ vault, memberToRemove }` | Squads config proposal. |
| `aegis.propose_threshold_change` | `{ vault, newThreshold }` | Squads config proposal. |

Cada `propose_*`:
1. Valida vault membership via API.
2. **Para `propose_payment` private:**
   - `generateUtxoKeypair()` (Poseidon-friendly keypair, não browser-only)
   - `createUtxo()` (constrói objeto UTXO; cheap)
   - `computeUtxoCommitment()` (Poseidon hash, ~50ms)
   - `computePayloadHash()` (SHA-256)
   - `buildIssueLicenseIx()` (constrói Anchor instruction para `cloak-gatekeeper.issue_license`)
3. Constrói + assina + envia Squads proposal on-chain via SDK.
4. POST no `/api/proposals` para registrar draft Aegis (com encryption-at-rest dos secrets via S3).
5. Returns `{ proposalIndex, transactionSignature, awaitingApprovals }`.

**Pré-requisito técnico:** `buildIssueLicenseIxBrowser` em `apps/web/lib/gatekeeper-instructions.ts` precisa ser portado para `packages/core/src/gatekeeper-instructions.ts` sem `"use client"`. ~30 min de refactor.

### 5.3 Vote tools

| Tool | Input | Side effect |
|---|---|---|
| `aegis.approve_proposal` | `{ vault, index }` | `proposalApprove` SDK call. |
| `aegis.reject_proposal` | `{ vault, index, reason? }` | `proposalReject` SDK call. |
| `aegis.cancel_proposal` | `{ vault, index }` | `proposalCancel` (post-threshold). **Sempre faz elicitation.** |

### 5.4 Invoice tools — **privacidade nativa real do MCP**

| Tool | Input | Output |
|---|---|---|
| `aegis.create_invoice` | `{ vault, amount, recipientWallet, memo?, invoiceRef? }` | `{ id, claimUrl }` |
| `aegis.list_my_invoices` | `{ status? }` | Invoices criadas pelo keypair owner. |
| `aegis.void_invoice` | `{ id }` | Marca como voided. |

**Aqui o MCP ENTREGA privacy completa, sem ZK, sem operator:**
- `nacl.box.keyPair()` — ephemeral box keypair
- `nacl.sign.keyPair.fromSeed(boxKp.secretKey.slice(0,32))` — sign keypair derivada
- claim URL: `/claim/${invoice.id}#v=1&sk=${secretBase64}&vault=${cofreAddress}`
- Recipient resgata via challenge-response (S4) — wallet nunca exposto
- POST `/api/stealth` com `signPubkey` no DB

Privacy aqui é Diffie-Hellman + symmetric encryption clássico, **não ZK**. MCP é cliente completo do fluxo.

### 5.5 Audit tools

| Tool | Input | Output |
|---|---|---|
| `aegis.create_audit_link` | `{ vault, scope, scopeParams?, ttlHours }` | `{ linkId, publicUrl, expiresAt }`. **Elicit se scope: "full"**. |
| `aegis.revoke_audit_link` | `{ linkId }` | Voida via on-chain proposal. |
| `aegis.export_audit` | `{ vault, format, scope, period }` | Retorna data inline (não cria link público). |

### 5.6 Tools NÃO incluídas no v1

- ❌ `execute_proposal` / `execute_with_license` — operator UI exclusivo
- ❌ `cloak_deposit` — exigiria SDK Cloak + ZK proof + circuits 12MB; UI-exclusive
- ❌ `claim_invoice` (recipient resgatando) — UI do recipient, não treasury MCP
- ❌ `register_operator` / `change_operator` — admin UI
- ❌ `delete_vault` — destrutivo

---

## 6. Resources

| URI Template | Conteúdo | MIME |
|---|---|---|
| `vault://list` | Vaults onde keypair é membro | `application/json` |
| `vault://{address}/info` | Snapshot completo do vault | `application/json` |
| `vault://{address}/members` | Members + roles | `application/json` |
| `vault://{address}/balance` | SOL + SPL balances | `application/json` |
| `proposal://{vault}/{index}` | Detalhes de proposal específica | `application/json` |
| `audit-link://{linkId}` | Metadata de audit link | `application/json` |
| `address-book://mine` | Address book do keypair owner | `application/json` |

---

## 7. Prompts

| Prompt name | Args | O que faz |
|---|---|---|
| `treasury-snapshot` | `{ vault?, period? }` | Estado do treasury: balance, pending, recent activity |
| `approve-pending` | `{ vault? }` | Walk-through de proposals pendentes com elicit por uma |
| `weekly-payroll` | `{ vault?, csvPath? }` | Submeter payroll batch da semana |
| `audit-export` | `{ vault?, scope?, period? }` | Gerar audit link |
| `find-spend` | `{ vault?, query }` | "Did we pay X last month?" |

---

## 8. Elicitation matrix

| Tool | Threshold | Elicit? |
|---|---|---|
| `propose_payment` | amount < 0.1 SOL | não |
| `propose_payment` | amount ≥ 0.1 SOL | sim — confirma recipient + amount |
| `propose_payment` | recipient não está em address book | sim — alerta "endereço desconhecido" |
| `propose_payroll` | recipients ≤ 5 | não |
| `propose_payroll` | recipients > 5 | sim |
| `propose_swap` | inputAmount ≥ 1 SOL | sim |
| `propose_member_*` | sempre | sim |
| `propose_threshold_change` | sempre | sim |
| `cancel_proposal` | sempre | sim |
| `create_audit_link` | scope: "full" | sim |
| `revoke_audit_link` | sempre | sim |
| `void_invoice` | sempre | sim |

Thresholds configuráveis via env (`AEGIS_ELICIT_*`).

---

## 9. Audit log

Cada tool call grava em `~/.aegis/mcp.log` (JSONL):

```json
{"ts":"2026-05-05T19:40:11Z","tool":"aegis.propose_payment","vault":"Cofre7...","input":{"amount":"500000000","recipient":"5xR..."},"result":"success","proposalIndex":42,"signature":"3fz..."}
```

**Sanitização**: nunca loga `keypairPrivateKey`, `blinding`, `secretKey`, `mnemonic`, ou conteúdo de `claimUrl#sk=...`.

---

## 10. Fluxos end-to-end

### 10.1 Pagamento privado

```
User → Claude: "Pay Vitalik 0.5 SOL for the consulting work."

Claude:
  1. aegis.resolve_recipient({query: "Vitalik"})
     → Server: GET /api/address-book → "Vitalik" → "5xR8m..."
  
  2. aegis.propose_payment({
       vault: AEGIS_DEFAULT_VAULT,
       recipient: "5xR8m...",
       amount: "500000000",
       memo: "Consulting, week of 2026-04-28",
       kind: "private"   # default
     })
     → 0.5 SOL ≥ 0.1 → ELICITATION
     → User confirma "yes"
     → Server (MCP):
        a. generateUtxoKeypair()
        b. createUtxo(amount, kp, NATIVE_SOL_MINT)  # cheap, no proof
        c. computeUtxoCommitment()                    # Poseidon hash
        d. buildIssueLicenseIx({payloadHash, nonce})  # Anchor ix, NO ZK
        e. createVaultProposal()                      # Squads proposal on-chain
        f. POST /api/proposals (registra draft + commitmentClaim cifrado)
     → Returns { proposalIndex: 42, signature: "3fz...", awaitingApprovals: "1 of 2" }

Claude → User: "Done. Proposal #42 created (private). Awaiting 1 more approval."

[Maria abre Slack/UI, aprova → threshold reached]

[Operator abre /vault/X/operator no browser:
   → cloakDepositBrowser() ROD A ZK PROOF (30s) AQUI
   → execute_with_license on-chain
   → SOL realmente flui via shielded pool]
```

A **privacy efetiva** acontece no último passo, fora do MCP. MCP só preparou a license.

### 10.2 Stealth invoice (privacy completa do MCP)

```
User → Claude: "Create an invoice for Alex to pay 200 USDC for office supplies."

Claude:
  1. aegis.create_invoice({
       vault: AEGIS_DEFAULT_VAULT,
       amount: "200000000",         # 200 USDC
       recipientWallet: "AlexWallet...",
       memo: "Office supplies invoice"
     })
     → Server (MCP):
        a. nacl.box.keyPair() → stealthPubkey
        b. nacl.sign.keyPair.fromSeed(boxKp.secretKey.slice(0,32)) → signPubkey
        c. POST /api/stealth (registra invoice no DB)
     → Returns { id, claimUrl: "/claim/abc#v=1&sk=...&vault=..." }

Claude → User: "Done. Send Alex this link: https://aegisz.xyz/claim/abc#v=1&sk=..."
```

Privacy aqui é completa: Alex nunca expõe wallet ao receber. Sem operator, sem ZK. Apenas NaCl.

### 10.3 Audit link

```
User: "Generate Q1 link for our auditor, amounts only."

Claude:
  aegis.create_audit_link({
    vault: ...,
    scope: "amounts_only",
    scopeParams: { startDate: 1704067200, endDate: 1711929599 },
    ttlHours: 168
  })
  → scope != "full" → no elicit
  → Server cria DB row + on-chain audit-link account
  → Returns { linkId, publicUrl }

Claude: "Send this to the auditor: https://aegisz.xyz/audit/abc123 (expires May 12)."
```

---

## 11. Distribuição

### 11.1 npm

- Pacote: `@aegis/mcp-server` (escopo `@aegis` precisa ser registrado no npm)
- Public, MIT
- Bin: executável (entry: `bin/aegis-mcp.ts`)
- `npx -y @aegis/mcp-server`

**Alternativas se `@aegis` indisponível:** `aegis-mcp-server`, `@cloak-squads/mcp-server`, `aegis-treasury-mcp`.

### 11.2 MCP Registry

Submeter ao [MCP Registry](https://modelcontextprotocol.io/registry/quickstart) via `mcp-publisher`:

```bash
mcp-publisher init
mcp-publisher publish
```

`server.json`:
```json
{
  "name": "io.github.lrafasouza/aegis-mcp-server",
  "description": "Multisig treasury for AI agents — propose payments, manage invoices, export audits on Solana with Squads + Aegis Gatekeeper",
  "repository": "https://github.com/lrafasouza/Aegis",
  "homepage": "https://aegisz.xyz",
  "license": "MIT",
  "version": "0.1.0",
  "packages": [{ "registry": "npm", "name": "@aegis/mcp-server" }]
}
```

### 11.3 Listings

- [pulsemcp.com](https://www.pulsemcp.com)
- [glama.ai/mcp](https://glama.ai/mcp/servers) (auto via npm)
- [mcpservers.org](https://mcpservers.org) (auto via npm)
- PR em [`modelcontextprotocol/servers`](https://github.com/modelcontextprotocol/servers)
- PR em [`solana-foundation/awesome-solana-ai`](https://github.com/solana-foundation/awesome-solana-ai)

---

## 12. Test plan

### 12.1 Unit tests (vitest)

`packages/aegis-mcp/tests/`:
- `auth.test.ts` — load keypair, sign session message, verify cookie set after login.
- `api-client.test.ts` — mock fetch, verify cookie sent, retry on 401.
- `tools/read.test.ts` — list_vaults, get_proposal contra mocked API.
- `tools/propose.test.ts` — propose_payment constrói license ix correta.
- `tools/invoice.test.ts` — create_invoice gera claimUrl + signPubkey.
- `elicitation.test.ts` — confirm/decline flow.

### 12.2 Integration test

`tests/integration/mcp-e2e.test.ts`:
- Inicia MCP server stdio com test keypair em devnet.
- Test client (`@modelcontextprotocol/sdk` test harness) faz tools/list, list_vaults, propose_payment.
- Verifica proposal aparece on-chain devnet.

### 12.3 Manual QA checklist

- [ ] `npx -y @aegis/mcp-server` instala em Claude Desktop.
- [ ] tools/list retorna 22 tools.
- [ ] `list_vaults` retorna vault de teste devnet.
- [ ] Login automático na primeira call → cookie cached.
- [ ] `propose_payment` 0.05 SOL → no elicit.
- [ ] `propose_payment` 1 SOL → elicit; confirma "yes" → cria proposal.
- [ ] User recusa elicit → erro graceful, sem proposal criada.
- [ ] `create_invoice` retorna claim URL com `#sk=`.
- [ ] `create_audit_link` scope:"full" → elicit.
- [ ] Resource `vault://{addr}/info` resolve.
- [ ] Prompt `/treasury-snapshot` formata output legível.
- [ ] Audit log local grava JSONL.
- [ ] Cookie expirado (> 30 min) → re-login automático silencioso.

---

## 13. Roadmap pós-v1

### v0.2
- Streaming responses para listagens grandes
- Read-only mode (`AEGIS_READ_ONLY=true`)
- Currency hints (USD conversion em elicits)

### v0.3
- Streamable HTTP transport com OAuth 2.1
- Aegis-hosted instance (`aegisz.xyz/mcp`)
- SSE notifications quando proposal aprovado/executado

### v0.4
- Slack MCP bridge (approvals via Slack)
- Calendar MCP (vesting agendamento)
- Notion MCP (sync com tabelas)

---

## 14. Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Prompt injection cria proposal lixo | baixa | Threshold 2+ aprovações + elicit. Pior: rejeitado. |
| `AEGIS_KEYPAIR_PATH` errado | média | Verificar pubkey vs `AEGIS_DEFAULT_VAULT` membership na startup. |
| User loses keypair file | média | Documentar backup. Multisig recovery via outros members. |
| Concurrent calls duplicam proposals | baixa | API rate-limit (S5) + idempotência via `transactionIndex`. |
| `squads-mcp` ganha tração antes | alta | Ship v1 em ≤ 2 semanas. Diferencial é gatekeeper + invoice + audit. |
| MCP spec evolui | baixa | Pin SDK version. Q1 2026 v2 stable trará migrations. |
| **User confunde "propose_payment private" com "Cloak full"** | média | **README + tool description deixam EXPLÍCITO: privacy efetivada na execução pelo operator.** |

---

## 15. Métricas de sucesso (3 meses)

| Métrica | Target |
|---|---|
| npm weekly downloads | ≥ 200 |
| GitHub stars | ≥ 50 |
| MCP Registry installs | ≥ 100 |
| Twitter mentions | ≥ 25 |
| Aegis monthly active vaults | +30% |
| Proposals criadas via MCP | ≥ 15% |
| Listed em ≥ 3 directories | ✅ |

Métrica narrativa: 1 post viral ("Claude managed my DAO treasury this week") com 10K+ views.

---

## 16. Pré-requisitos técnicos antes da implementação

1. **Refactor `buildIssueLicenseIxBrowser`** de `apps/web/lib/gatekeeper-instructions.ts` para `packages/core/src/gatekeeper-instructions.ts` (remover `"use client"`, manter compat com Web Crypto via Node 20 globals). ~30 min.
2. **Verificar `@cloak.dev/sdk-devnet` Node compat**: `generateUtxoKeypair`, `createUtxo`, `computeUtxoCommitment` devem rodar em Node sem `window`. Audit + workarounds se preciso. ~1h.
3. **Endpoint `/api/auth/login` aceita keypair-owned signature** (já implementado pela última edição).
4. **Reservar npm scope** `@aegis` ou decidir alternativa.

---

## 17. Aprovação

- [ ] Spec revisado pelo owner
- [ ] Decisões aprovadas:
  - [ ] Stdio-only para v1
  - [ ] Operator NUNCA exposto
  - [ ] Default `kind: "private"` em propose_payment (= license issuance, não Cloak completo)
  - [ ] Disclosure clara: "MCP prepara licença; privacy efetivada via operator UI"
  - [ ] Elicitation thresholds (0.1 SOL / 5 recipients / 1 SOL swap)
  - [ ] npm package name `@aegis/mcp-server` (ou alternativa)
- [ ] Pré-requisitos técnicos resolvidos (§16)
- [ ] Implementação completa (5–7 dias)
- [ ] Tests + manual QA
- [ ] npm publish + MCP Registry submit
- [ ] Demo video + Twitter thread

---

## 18. Sources

- [Model Context Protocol official docs](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart)
- [MCP elicitation spec](https://modelcontextprotocol.io/specification/draft/client/elicitation)
- [Squads MCP (concorrente)](https://github.com/dorkydhruv/squads-mcp)
- [SendAI Solana MCP](https://github.com/sendaifun/solana-mcp)
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [OWASP MCP secure development guide](https://genai.owasp.org/resource/a-practical-guide-for-secure-mcp-server-development/)
- [Awesome Solana AI](https://github.com/solana-foundation/awesome-solana-ai)
- [@cloak.dev/sdk-devnet README](https://www.npmjs.com/package/@cloak.dev/sdk-devnet)
- Aegis internal: `apps/web/lib/auth-session.ts`, `apps/web/lib/wallet-auth.ts`, `apps/web/app/api/auth/login/route.ts`
