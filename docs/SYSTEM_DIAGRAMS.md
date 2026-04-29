# Aegis — Diagramas do Sistema

Documento visual de toda a aplicação. Diagramas em **Mermaid** (renderizam direto no
GitHub, no preview do VS Code e em qualquer visualizador Markdown moderno).

> Aegis = camada de **execução privada** para multisigs Squads v4. Membros
> aprovam um envio on-chain → o gatekeeper emite uma **licença** com hash do payload
> → o **operador** consome a licença e executa o depósito privado no Cloak.

---

## 1. Visão geral — quem fala com quem

```mermaid
flowchart LR
    User([Usuário / Membro do Multisig])
    Browser[Browser<br/>UTXO + secrets em sessionStorage]
    Web[Next.js 15 Web App<br/>apps/web]
    DB[(SQLite via Prisma<br/>ProposalDraft · PayrollDraft<br/>AuditLink · StealthInvoice)]
    API[REST API<br/>/api/proposals · /api/payrolls<br/>/api/audit-links · /api/stealth]
    Wallet[Wallet Adapter<br/>assina ix locais]

    subgraph Solana[Solana Devnet]
        Squads[Squads v4<br/>SQDS4ep65T8...<br/>multisig + proposals + vault]
        GK[cloak-gatekeeper<br/>AgFx8yS8bQ...<br/>Cofre · License · ViewKey]
        Cloak[Cloak Protocol<br/>shield pool real<br/>via @cloak.dev/sdk-devnet]
    end

    User --> Browser --> Web
    Web -->|drafts, leitura/escrita| API --> DB
    Web -->|build ix| Wallet
    Wallet -->|sendTransaction| Squads
    Wallet -->|sendTransaction| GK
    Wallet -->|transact deposit| Cloak

    Squads -. vaultTransactionExecute CPI .-> GK
    GK -. eventos LicenseConsumed .-> Web
    Cloak -. UTXO commitment .-> Web

    classDef chain fill:#0f172a,stroke:#22d3ee,color:#e2e8f0
    classDef ui fill:#1e293b,stroke:#a78bfa,color:#e2e8f0
    classDef store fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe
    class Squads,GK,Cloak chain
    class Browser,Web,Wallet ui
    class DB,API store
```

**Pontos-chave:**

- Tudo que é segredo (note keypair, blinding, viewing key) **fica no browser** (sessionStorage). Server só guarda metadado público.
- O gatekeeper é uma **state machine pura** — não faz CPI no Cloak. Quem chama o `transact()` é o operador, em transação separada.
- A vault PDA do Squads é o "inner signer" no `issue_license`: é assim que o gatekeeper sabe que o pedido veio de um vault legítimo.

---

## 2. Componentes on-chain (3 programas, 2 contas)

```mermaid
flowchart TB
    subgraph SQ["Squads v4 (externo)"]
        MS[Multisig PDA<br/>members · threshold]
        PR[Proposal PDA]
        VT[VaultTransaction PDA]
        VPDA[Vault PDA<br/>inner signer]
        MS --> PR --> VT --> VPDA
    end

    subgraph GK["cloak-gatekeeper (Anchor)"]
        direction TB
        COFRE[(Cofre PDA<br/>multisig · operator<br/>view_key_public<br/>revoked_audit Vec)]
        LIC[(License PDA<br/>cofre · payload_hash<br/>nonce · ttl · status)]
        VKD[(ViewKeyDistribution<br/>encrypted entries por signer)]
        IX1{{init_cofre}}
        IX2{{issue_license}}
        IX3{{execute_with_license}}
        IX4{{init_view_distribution<br/>add_signer_view<br/>remove_signer_view}}
        IX5{{close_expired_license<br/>emergency_close_license}}
        IX6{{revoke_audit<br/>set_operator}}

        IX1 --> COFRE
        IX2 --> LIC
        IX3 --> LIC
        IX4 --> VKD
        IX5 --> LIC
        IX6 --> COFRE
    end

    subgraph CL["Cloak Protocol (mock devnet)"]
        DEPOSIT[transact com 0 inputs<br/>= deposit puro]
        WITHDRAW[fullWithdraw<br/>= claim de stealth]
    end

    VPDA -- vaultTransactionExecute --> IX2
    IX3 -. emit LicenseConsumed .-> Outside[(Indexers / Web)]
    Operator((Operator wallet)) --> DEPOSIT
    Operator --> IX3
    Recipient((Recipient stealth)) --> WITHDRAW

    classDef pda fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe
    classDef ix fill:#1e1b4b,stroke:#a78bfa,color:#ede9fe
    class COFRE,LIC,VKD,MS,PR,VT,VPDA pda
    class IX1,IX2,IX3,IX4,IX5,IX6 ix
```

| Conta | Vive em | O que guarda |
|-------|---------|--------------|
| `Cofre` | gatekeeper | 1 por multisig — operator atual, view key pública, lista de diversifiers revogados |
| `License` | gatekeeper | 1 por execução — `payload_hash`, `nonce`, `expires_at`, `status` (Active/Consumed) |
| `ViewKeyDistribution` | gatekeeper | distribuição da view key cifrada por signer (NaCl box) |
| `Multisig`/`Proposal`/`VaultTransaction` | Squads v4 | governança + voting + execução do bundle |

---

## 3. Mapa do frontend (rotas + componentes)

```mermaid
flowchart LR
    L[/"/" — Landing<br/>colar endereço do multisig/] --> CD

    subgraph Cofre["/cofre/[multisig]"]
        CD[/page.tsx<br/>Dashboard<br/>drafts · stats · endereços/]
        S[/send<br/>Private Send F1/]
        P[/payroll<br/>Batch CSV F2/]
        A[/audit<br/>Audit Admin F3/]
        I[/invoice<br/>Stealth Invoicing F4/]
        O[/operator<br/>execute_with_license<br/>+ cloakDeposit/]
        Pr[/proposals/:id<br/>Approve / Execute<br/>CommitmentCheck/]
    end

    CD --> S & P & A & I & O
    S -->|cria proposal| Pr
    P -->|cria proposal| Pr
    Pr -->|threshold OK| O

    Pub1[/audit/:linkId<br/>público — Cloak scan/]
    Pub2[/claim/:stealthId<br/>público — fullWithdraw/]
    A -. gera link público .-> Pub1
    I -. gera link público .-> Pub2

    classDef priv fill:#1e293b,stroke:#a78bfa,color:#e9d5ff
    classDef pub fill:#064e3b,stroke:#34d399,color:#d1fae5
    class CD,S,P,A,I,O,Pr priv
    class Pub1,Pub2 pub
```

**API REST (server, Next.js route handlers)**

```
/api/proposals               POST  · GET (lista por multisig)
/api/proposals/:multisig
/api/proposals/:multisig/:index   GET single

/api/payrolls                POST · GET lista
/api/payrolls/:multisig/:index    GET single

/api/audit-links             POST
/api/audit-links/:cofre      GET lista
/api/audit/:linkId           GET público (revelação)
/api/audit/:linkId/revoke    POST

/api/stealth                 POST · GET lista
/api/stealth/:id             GET single
/api/stealth/:id/utxo        PATCH (operator grava UTXO p/ claim)
/api/stealth/:id/claim       POST (recipient marca como claimed)
```

---

## 4. Feature F1 — Private Send (fluxo completo)

```mermaid
sequenceDiagram
    autonumber
    actor M as Membro do Multisig
    participant B as Browser (Cloak SDK)
    participant W as Wallet
    participant API as /api/proposals
    participant DB as SQLite
    participant SQ as Squads v4
    participant GK as Gatekeeper
    actor OP as Operator
    participant CL as Cloak (transact)

    Note over M,B: Etapa 1 — criar proposta
    M->>B: amount, recipient, memo
    B->>B: gerar UTXO keypair + blinding
    B->>B: computeUtxoCommitment(utxo)
    B->>B: computePayloadHash(invariants)
    B->>W: vaultTransactionCreate + proposalCreate<br/>(inner ix = issue_license)
    W->>SQ: sendTransaction
    SQ-->>B: proposal index
    B->>API: POST draft (sem segredos)
    API->>DB: INSERT ProposalDraft
    B->>B: sessionStorage.set(commitmentClaim)<br/>keypair · blinding · tokenMint

    Note over M,SQ: Etapa 2 — aprovação (cada signer)
    M->>W: proposalApprove
    W->>SQ: vote on-chain
    B-->>B: poll status a cada 3s

    Note over M,GK: Etapa 3 — execute (qualquer signer após threshold)
    M->>W: vaultTransactionExecute
    W->>SQ: sendTransaction
    SQ->>GK: CPI issue_license(payload_hash, nonce, ttl)
    GK->>GK: cria License { Active, expires_at }

    Note over OP,CL: Etapa 4 — operador consome
    OP->>API: GET draft
    OP->>CL: transact() com 0 inputs (deposit real)
    CL-->>OP: leafIndex + commitment
    OP->>W: execute_with_license(invariants)
    W->>GK: sendTransaction (CU=200K + priority fee)
    GK->>GK: verifica operator + payload_hash + ttl
    GK->>GK: marca License = Consumed
    GK-->>B: emit LicenseConsumed
```

**Invariantes que entram no `payload_hash`** (SHA-256, com domain separator):
`token_mint · amount · recipient · cofre · expires_at · nonce`. Trocar 1 byte
quebra o execute — é o que impede o operador de "redirecionar" o envio.

---

## 5. Feature F2 — Payroll em batch (CSV)

```mermaid
sequenceDiagram
    autonumber
    actor Adm as Admin
    participant B as Browser
    participant W as Wallet
    participant SQ as Squads v4
    participant GK as Gatekeeper
    actor OP as Operator
    participant CL as Cloak

    Adm->>B: upload CSV (name, wallet, amount, memo)
    B->>B: parse + validar (lib/payroll-csv)
    loop por destinatário
        B->>B: gera UTXO + commitment + payload_hash
    end
    B->>W: 1 vaultTransactionCreate com N inner ix issue_license
    W->>SQ: sendTransaction
    Note over B: 1 PayrollDraft + N PayrollRecipient (Prisma)

    Adm->>SQ: proposalApprove (signers)
    Adm->>SQ: vaultTransactionExecute<br/>↳ CPI N× issue_license
    Note over GK: N Licenses Active (mesmo bundle)

    loop cada license ativa
        OP->>CL: transact (deposit por destinatário)
        OP->>GK: execute_with_license (consome 1 license)
    end
```

**Por que tudo em uma proposal?** Aprovação atômica. Os signers aprovam o lote
inteiro de payroll. Se algum invariante falhar, nenhuma licença é emitida.

---

## 6. Feature F3 — Audit Admin (revelação seletiva)

```mermaid
sequenceDiagram
    autonumber
    actor Adm as Admin / Compliance
    participant B as Browser
    participant API as /api/audit-links
    participant DB as SQLite
    participant SQ as Squads v4
    participant GK as Gatekeeper
    actor Aud as Auditor (público)
    participant CL as Cloak Scan

    Adm->>B: define scope (período, contraparte) + TTL
    B->>B: computeAuditDiversifier (BLAKE3)
    B->>B: assina diversifier com a wallet do Squads
    B->>API: POST AuditLink<br/>{ cofre, diversifier, scope, signature, expiresAt }
    API->>DB: INSERT AuditLink
    API-->>Adm: link público /audit/{linkId}

    Adm->>Aud: compartilha link

    Aud->>B: abre /audit/{linkId}
    B->>API: GET /api/audit/{linkId}
    API->>DB: lê AuditLink
    API->>API: verifica assinatura + expiresAt
    API-->>B: diversifier + scope
    B->>CL: scan via diversifier (revela só o subset)
    CL-->>Aud: txs cobertas pelo escopo

    Note over Adm,GK: Revogação a qualquer momento
    Adm->>GK: revoke_audit(diversifier_trunc[16])
    GK->>GK: append em Cofre.revoked_audit
    Note over B,CL: scans futuros com esse diversifier falham
```

**Importante:** o link é público mas **só revela o que estava no escopo assinado**.
Sem assinatura válida ou se o diversifier estiver na lista revogada do `Cofre`,
o scan retorna vazio. Isso é o "view key seletivo" do Cloak.

---

## 7. Feature F4 — Stealth Invoicing + Claim

```mermaid
sequenceDiagram
    autonumber
    actor Pay as Pagador (multisig)
    actor Rec as Recebedor
    participant B as Browser pagador
    participant API as /api/stealth
    participant DB as SQLite
    participant SQ as Squads v4
    participant GK as Gatekeeper
    actor OP as Operator
    participant CL as Cloak
    participant Bc as Browser recebedor

    Note over Pay,B: 1) Recebedor compartilha stealthPubkey<br/>(gerado offline, sem doxar wallet)
    Pay->>B: cria invoice (stealthPubkey, valor, memo)
    B->>API: POST StealthInvoice
    API->>DB: status=Pending

    Note over Pay,GK: 2) mesmo flow F1 (proposal → approve → execute)
    B->>SQ: cria proposal com payload_hash do recipient stealth
    Pay->>SQ: proposalApprove
    Pay->>SQ: vaultTransactionExecute (issue_license)

    Note over OP,CL: 3) Operador deposita no Cloak<br/>e GRAVA UTXO no servidor (precisa pro claim)
    OP->>CL: transact (deposit)
    CL-->>OP: leafIndex + commitment
    OP->>API: PATCH /stealth/:id/utxo<br/>{ amount, privKey, blinding, leafIndex, ... }
    API->>DB: status=Funded
    OP->>GK: execute_with_license

    Note over Rec,Bc: 4) Recebedor reivindica
    Rec->>Bc: abre /claim/{stealthId}
    Bc->>API: GET /stealth/:id (lê UTXO)
    Bc->>CL: fullWithdraw(utxo, recipientWallet)
    CL-->>Rec: SOL/SPL na sua wallet
    Bc->>API: POST /stealth/:id/claim
    API->>DB: status=Claimed, claimedBy
```

**Por que UTXO fica no server (e não em sessionStorage)?** O recebedor não tem
sessão prévia. Ele precisa abrir o link e claim. As chaves do UTXO **não**
expõem o multisig — só permitem retirar aquele depósito específico para a
wallet do recebedor.

---

## 8. Máquina de estados — License

```mermaid
stateDiagram-v2
    [*] --> Active: issue_license<br/>(via Squads CPI)

    Active --> Consumed: execute_with_license<br/>operator + payload OK
    Active --> [*]: close_expired_license<br/>(após expires_at)
    Active --> [*]: emergency_close_license<br/>(operator force-close)

    Consumed --> [*]: rent reclaim<br/>(close_authority)

    note right of Active
        Validações no execute:
        - signer == cofre.operator
        - now < expires_at
        - sha256(invariants) == license.payload_hash
        - status == Active
    end note
```

**Equivalente para Proposal (Squads v4)** — fora do nosso programa, mas é o gate
anterior:

```mermaid
stateDiagram-v2
    [*] --> Draft: proposalCreate
    Draft --> Active: members podem votar
    Active --> Approved: approvals >= threshold
    Active --> Rejected: rejections >= threshold
    Approved --> Executed: vaultTransactionExecute<br/>(CPI issue_license)
    Rejected --> [*]
    Executed --> [*]
```

---

## 9. Modelo de dados (Prisma · SQLite)

```mermaid
erDiagram
    ProposalDraft {
        string id PK
        string cofreAddress
        string transactionIndex
        string amount
        string recipient
        string memo
        bytes payloadHash
        string invariants
        string commitmentClaim "público — sem segredos"
        string signature
        datetime createdAt
    }

    PayrollDraft ||--o{ PayrollRecipient : has
    PayrollDraft {
        string id PK
        string cofreAddress
        string transactionIndex
        string memo
        string totalAmount
        int recipientCount
        datetime createdAt
    }

    PayrollRecipient {
        string id PK
        string payrollDraftId FK
        string name
        string wallet
        string amount
        bytes payloadHash
        string invariants
        string commitmentClaim
    }

    AuditLink {
        string id PK
        string cofreAddress
        bytes diversifier
        string scope
        string scopeParams
        datetime expiresAt
        string issuedBy
        bytes signature
    }

    StealthInvoice {
        string id PK
        string cofreAddress
        string recipientWallet
        string stealthPubkey
        bytes amountHintEncrypted
        string status "Pending|Funded|Claimed"
        datetime expiresAt
        datetime claimedAt
        string utxoAmount "preenchido pelo operator"
        string utxoPrivateKey
        string utxoBlinding
        int utxoLeafIndex
    }
```

**Regra de ouro de segurança no DB:**
- `commitmentClaim` é **público** (commitment já vai on-chain).
- **Segredos do UTXO de drafts/payroll** ficam em `sessionStorage` do criador.
- **Segredos do UTXO de stealth invoice** ficam no DB porque o recebedor precisa lê-los para fazer claim — mas só revelam aquele depósito específico.

---

## 10. Tela por feature (resumo de produto)

```mermaid
mindmap
  root((Aegis))
    F1 Private Send
      /send (form)
      proposals/:id (approve / execute)
      operator (cloakDeposit + execute_with_license)
    F2 Payroll
      /payroll (CSV upload)
      1 proposta · N licenses
      operator processa em loop
    F3 Audit Admin
      /audit (gera diversifier + assina)
      /audit/:linkId (público, scan Cloak)
      revoke_audit on-chain
    F4 Stealth Invoicing
      /invoice (cria invoice)
      operator grava UTXO
      /claim/:id (recebedor → fullWithdraw)
    Operação
      init_cofre
      init_view_distribution
      add/remove_signer_view
      set_operator
      close_expired_license
      emergency_close_license
```

---

## 11. Pacote compartilhado `@cloak-squads/core`

```mermaid
flowchart LR
    types[types.ts<br/>PayloadInvariants<br/>AuditDiversifierInput]
    enc[encoding.ts<br/>LE u64 · pubkey bytes<br/>domain separators]
    hash[hashing.ts<br/>computePayloadHash SHA-256<br/>computeAuditDiversifier BLAKE3]
    pda[pda.ts<br/>cofrePda · licensePda<br/>squadsVaultPda]
    com[commitment.ts<br/>recomputeCommitment<br/>commitmentsEqual]
    sq[squads-adapter.ts<br/>Squads PDA helpers]
    gkc[gatekeeper-client.ts<br/>Anchor ix builders<br/>usado em scripts]
    vk[view-key.ts<br/>nacl.box encrypt/decrypt]

    types --> hash & com
    enc --> hash & pda
    hash --> com
    pda --> sq & gkc
```

O **frontend NÃO usa** `gatekeeper-client.ts` (Anchor) — usa
`apps/web/lib/gatekeeper-instructions.ts` que serializa as ix manualmente.
Razão: evitar bundle do Anchor no cliente e ter controle fino sobre layout
das contas. Os scripts de devnet/CI continuam usando o builder Anchor.

---

## 12. Ambientes & artefatos

```mermaid
flowchart TB
    subgraph Dev[Dev local]
        D1[pnpm -F web dev<br/>localhost:3000]
        D2[Prisma dev.db<br/>SQLite local]
        D3[bankrun integration tests<br/>tests/integration]
    end

    subgraph DN[Devnet]
        DN1[Squads v4 oficial]
        DN2[gatekeeper deployado<br/>scripts/deploy-gatekeeper]
        DN3[cloak-mock OU SDK real]
        DN4[E2E real<br/>scripts/f1-e2e-devnet.ts]
    end

    subgraph CI[Pipeline]
        C1[anchor build]
        C2[pnpm typecheck:all]
        C3[pnpm test:int<br/>5 suítes bankrun]
        C4[pnpm prebuild:web]
    end

    Dev -->|push| CI
    CI -->|deploy:gk| DN
    DN -->|.env.local atualizado| Dev
```

---

## Como ler este documento

1. **Quer entender o produto?** → Comece em §1 (visão geral) e §10 (mindmap de features).
2. **Quer entender o que acontece quando aperto "Send"?** → §4 (sequência F1).
3. **Vai mexer no programa Anchor?** → §2 (componentes on-chain) + §8 (state machine).
4. **Vai mexer no DB ou API?** → §9 (ER) + §3 (rotas).
5. **Vai trabalhar no shared core?** → §11.

Para detalhes textuais complementares: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md),
[`docs/SECURITY.md`](SECURITY.md), [`docs/DEMO.md`](DEMO.md).
