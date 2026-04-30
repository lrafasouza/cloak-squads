# Aegis — Backend Implementation Playbook

> Spec autocontido para um agente implementar **apenas a parte backend** dos tickets, incluindo a porção backend dos tickets mistos. Pareie com `IMPLEMENTATION_PLAYBOOK.md` (visão completa) e `MELHORIAS_DETALHADAS.md` (estratégia).
>
> **Track frontend** trabalha em paralelo em outro modelo. Sincronize via os contratos definidos aqui (interfaces de API, shape de DB).

---

## Status atual (atualizado 30/04/2026)

| Ticket | Descrição | Status |
|---|---|---|
| #1 | Prisma DATABASE_URL — manter PostgreSQL | ✅ **DONE** |
| #4-AUDIT | API auth matrix (`docs/API_AUTH_MATRIX.md`) | ✅ **DONE** |
| #5-CONTRACT | Contratos de API (`docs/API_CONTRACTS.md`) | ✅ **DONE** |
| #13a | SDK wrapper `proposalCancel` (Caso A — SDK suporta) | ✅ **DONE** |
| #13b | Archive de proposals (DB + API) | ✅ **DONE** |
| #15b | Helper `loadMultisigInfo` (read-only on-chain) | ✅ **DONE** |
| #20 | Idempotência da proposal de init (gap §1.1 das melhorias) | ✅ **DONE** |
| #19 | Renomear commits (rebase) | ⏸️ **PENDENTE** (coordenação) |

### Cobertura do `MELHORIAS_DETALHADAS.v1.md.bak`

| Seção das Melhorias | Demanda backend | Atendido por |
|---|---|---|
| §1.1 Múltiplas proposals de init no 2-of-2 | Idempotência on-chain/DB | ✅ #20 |
| §1.2 Sincronização de status (badge, listas) | Filtros + DTOs estáveis | ✅ #5-CONTRACT, #13b |
| §1.3 Cancelar/arquivar proposal | `proposalCancel` + archive | ✅ #13a, #13b |
| §1.4 Shielded balance travado | (frontend — sem backend) | — |
| §1.5 Wallet pede assinatura em leitura | Mapeamento de auth | ✅ #4-AUDIT |
| §3 Audit revisão completa | (frontend — backend OK) | — |
| §4 Settings → Members | Helper on-chain | ✅ #15b |
| §§2, 5–9 UX/redesign/landing/mobile | (puramente frontend) | — |
| §10 Renomear commits | Rebase | ⏸️ #19 |
| §11 Erro Prisma `DATABASE_URL` | Forçar PostgreSQL | ✅ #1 |

---

## 0. Contexto do projeto

### Stack backend

- **Next.js 15 App Router** — API routes em `apps/web/app/api/**/route.ts`
- **Prisma 5** — ORM, schema em `apps/web/prisma/schema.prisma`
- **PostgreSQL** — provider (migrations já versionadas com tipos `BYTEA`)
- **Zod** — validação de payloads
- **`@solana/web3.js`** + `@coral-xyz/anchor` — interação on-chain
- **`@sqds/multisig`** v2.1.4 — Squads Protocol SDK
- **`tweetnacl`** + `bs58` — verificação de assinaturas Ed25519
- **`pino`** — logger estruturado

### Convenções

| Item | Padrão |
|---|---|
| Linter/formatter | Biome (`pnpm lint`, `pnpm format`) |
| Type check | `pnpm typecheck` na raiz |
| Path alias | `@/` → `apps/web/` |
| Auth scheme | Header `x-solana-pubkey` + `x-solana-signature` + `x-solana-timestamp`, mensagem `aegis:<pubkey>:<unix>`, janela 5min |
| Validação | `zod` em todo body de POST/PATCH |
| Rate limit | `lib/rate-limit.ts` `checkRateLimit(identifier, limit, window)` |
| Resposta erro | `NextResponse.json({ error: "..." }, { status })` |
| Logs | `pino` (já configurado) — não `console.log` em produção |
| Commits | conventional: `feat(web):`, `fix(web):`, `refactor(web):` |

### Mapa do backend

```
apps/web/
├── app/api/
│   ├── audit/[linkId]/route.ts                GET público (read shared link)
│   ├── audit/[linkId]/revoke/route.ts         POST 🔒 auth
│   ├── audit-links/route.ts                   POST 🔒 auth (cria link)
│   ├── audit-links/[vault]/route.ts           GET público (lista links do vault)
│   ├── circuits/[...path]/route.ts            proxy circuits (público)
│   ├── cloak-relay/[...path]/route.ts         proxy cloak (público)
│   ├── payrolls/route.ts                      POST 🔒 auth
│   ├── payrolls/[multisig]/route.ts           GET público
│   ├── payrolls/[multisig]/[index]/route.ts   GET/PATCH (verificar)
│   ├── proposals/route.ts                     POST 🔒 auth
│   ├── proposals/[multisig]/route.ts          GET público
│   ├── proposals/[multisig]/[index]/route.ts  GET/PATCH (verificar)
│   ├── stealth/route.ts                       POST 🔒 auth
│   ├── stealth/[id]/route.ts                  GET (verificar)
│   ├── stealth/[id]/claim/route.ts            POST 🔒 auth
│   └── stealth/[id]/utxo/route.ts             POST 🔒 auth
├── lib/
│   ├── prisma.ts                              client lazy + isPrismaAvailable()
│   ├── wallet-auth.ts                         verifier (Ed25519 + freshness 5min)
│   ├── proposals.ts                           helpers Squads proposals (off-chain merge)
│   ├── squads-sdk.ts                          wrappers Squads v4 (16KB)
│   ├── env.ts                                 typed env vars
│   ├── rate-limit.ts                          per-IP rate limiter
│   ├── serialize-proposal-draft.ts            DB row → ProposalDraft DTO
│   ├── operator-license-state.ts              license state helpers
│   ├── gatekeeper-instructions.ts             CPI helpers
│   └── payroll-csv.ts                         CSV parser
├── prisma/
│   ├── schema.prisma                          PostgreSQL provider
│   └── migrations/
│       ├── migration_lock.toml                provider = "postgresql"
│       └── 20260429160000_init/migration.sql
```

### Auth helper (lib/wallet-auth.ts:85)

```ts
export async function requireWalletAuth(): Promise<{ publicKey: string } | NextResponse> {
  const auth = await verifyWalletAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return { publicKey: auth.publicKey };
}
```

Uso em route:
```ts
const auth = await requireWalletAuth();
if (auth instanceof NextResponse) return auth;
// auth.publicKey é string base58
```

---

## 1. TICKETS BACKEND

---

### TICKET #1 · Prisma DATABASE_URL — manter PostgreSQL  ✅ DONE

**Severidade:** 🔴 Bloqueador
**Estimativa:** 30min
**Implementado:** 30/04/2026
**Resultado:**
- `.env.example` agora aponta para `postgresql://postgres:postgres@localhost:5432/aegis_dev`
- `docker-compose.yml` criado na raiz (Postgres 16-alpine + healthcheck)
- `apps/web/lib/prisma.ts` `isPrismaAvailable()` valida prefixo `postgresql://` ou `postgres://`
- README atualizado (substituídas todas as menções a SQLite, adicionado passo `docker compose up -d postgres`)
- `pnpm -F web prisma validate` passa com `DATABASE_URL` setado

**Contexto:**
`prisma/schema.prisma` declara `provider = "postgresql"` e migrations versionadas usam tipos PostgreSQL (`BYTEA`). Mas `.env.example` está com `DATABASE_URL=file:./dev.db` (SQLite). API routes que usam Prisma quebram em runtime com erro de protocolo.

**Decisão fixa:** **manter PostgreSQL**. Não trocar provider — exigiria reset de migrations.

**Arquivos:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/prisma/schema.prisma:5-8`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/prisma/migrations/migration_lock.toml`
- `/Users/rafazaum/Desktop/cloak-squads/.env.example:20-22`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/lib/prisma.ts:39-41`
- Criar: `/Users/rafazaum/Desktop/cloak-squads/docker-compose.yml`

**Implementação:**

1. **Atualizar `.env.example`:**
   ```env
   # Local dev (use docker compose up -d postgres):
   #   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegis_dev
   # Production (Render, Supabase, etc.):
   #   DATABASE_URL=postgresql://user:pass@host:5432/db
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegis_dev
   ```

2. **Criar `docker-compose.yml` na raiz:**
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       container_name: aegis-postgres
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgres
         POSTGRES_DB: aegis_dev
       ports:
         - "5432:5432"
       volumes:
         - aegis-postgres:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U postgres -d aegis_dev"]
         interval: 5s
         timeout: 3s
         retries: 5

   volumes:
     aegis-postgres:
   ```

3. **Hardening de `lib/prisma.ts:39-41`:**
   ```ts
   export function isPrismaAvailable(): boolean {
     const url = process.env.DATABASE_URL;
     if (!url) return false;
     return url.startsWith("postgresql://") || url.startsWith("postgres://");
   }
   ```

4. **Atualizar README** (seção setup) com:
   ```bash
   docker compose up -d postgres
   pnpm -F web prisma migrate dev
   pnpm -F web prisma generate
   ```

**Aceite:**
- [ ] `docker compose up -d postgres` sobe Postgres saudável
- [ ] `pnpm -F web prisma migrate dev` aplica migrations sem erro
- [ ] `pnpm -F web build` passa sem erro Prisma
- [ ] `curl localhost:3000/api/payrolls/<multisig>` retorna 200/400 (não 500 de protocolo)
- [ ] `migration_lock.toml` permanece `provider = "postgresql"`
- [ ] Sem warning `the URL must start with the protocol postgresql://`

---

### TICKET #4-AUDIT · Mapeamento de endpoints públicos vs autenticados  ✅ DONE

**Severidade:** 🔴 Pré-requisito do frontend
**Estimativa:** 1h
**Implementado:** 30/04/2026
**Resultado:**
- `docs/API_AUTH_MATRIX.md` criado com classificação de **20 handlers** (16 routes)
- 2 issues de segurança flagrados:
  - ✅ GET `/api/proposals/[multisig]/[index]` agora omite `commitmentClaim` por padrão; `?includeSensitive=true` exige wallet auth
  - 🟡 GET `/api/stealth/[id]` expõe dados UTXO sem auth
**Output esperado:** Markdown que o frontend lê para saber onde trocar `fetchWithAuth` → `fetch`.

**Contexto:**
O frontend está chamando `fetchWithAuth` em `useEffect` no mount mesmo para GETs públicos, abrindo popup de wallet sem ação do usuário. Antes de corrigir o frontend, o backend precisa **garantir que cada endpoint está corretamente classificado** e produzir uma tabela autoritativa.

**Procedimento:**

1. **Listar todas as routes:**
   ```bash
   find apps/web/app/api -name route.ts
   ```

2. **Para cada route, abrir e classificar cada handler (GET/POST/PATCH/DELETE):**
   - **Privado** se chama `requireWalletAuth()` ou `verifyWalletAuth()` no início.
   - **Público** se não chama.
   - **Misto** se um método (ex: GET) é público e outro (POST) é privado.

3. **Validar regras de negócio:**
   - GET de listagem on-chain agregada (proposals, payrolls) → **público** (dado já público on-chain).
   - GET de drafts privados (campos sensíveis: blinding, sk_spend) → deveria ser **privado** mesmo que hoje seja público. **Flag** isso como issue.
   - POST/PATCH/DELETE de qualquer recurso que muta DB → **privado** sempre.
   - Audit links públicos por design (compartilháveis) → GET por linkId é público.
   - Stealth claim/utxo (operações sensíveis) → privado.

4. **Conferir se há endpoints retornando dados sensíveis sem auth.** Caso encontre, criar issue separada (não corrigir aqui — pode quebrar frontend).

**Output (criar `docs/API_AUTH_MATRIX.md`):**

```md
# API Auth Matrix

| Route | Method | Auth | Notas |
|---|---|---|---|
| /api/proposals | POST | 🔒 | cria draft |
| /api/proposals/[multisig] | GET | 🌐 | lista pública |
| /api/proposals/[multisig]/[index] | GET | 🌐 | leitura |
| /api/proposals/[multisig]/[index] | PATCH | 🔒 | atualiza draft |
| /api/payrolls | POST | 🔒 | cria payroll |
| /api/payrolls/[multisig] | GET | 🌐 | lista |
| /api/payrolls/[multisig]/[index] | GET | 🌐 | leitura |
| /api/audit-links | POST | 🔒 | emite link |
| /api/audit-links/[vault] | GET | 🌐 | lista |
| /api/audit/[linkId] | GET | 🌐 | leitura pública compartilhável |
| /api/audit/[linkId]/revoke | POST | 🔒 | revoga link |
| /api/stealth | POST | 🔒 | cria stealth |
| /api/stealth/[id] | GET | ❓ | verificar e preencher |
| /api/stealth/[id]/claim | POST | 🔒 | claim |
| /api/stealth/[id]/utxo | POST | 🔒 | utxo |
| /api/circuits/[...path] | * | 🌐 | proxy |
| /api/cloak-relay/[...path] | * | 🌐 | proxy |

## Issues encontradas
- (lista qualquer endpoint que parece estar com auth errada)
```

5. **Comunicar ao frontend:** notificar que o arquivo está pronto (commit + mensagem explícita).

**Aceite:**
- [ ] `docs/API_AUTH_MATRIX.md` criado com **todos os 16 routes** classificados
- [ ] Cada classificação confirmada lendo o handler (não chute)
- [ ] Issues de auth incorreta listadas (se houver)
- [ ] Frontend pode usar o doc para fazer o TICKET #4-consumo

---

### TICKET #13a · SDK wrapper `proposalCancel` (on-chain)  ✅ DONE

**Severidade:** 🟢 Feature (depende do SDK)
**Estimativa:** 1h (incluindo investigação)
**Implementado:** 30/04/2026 — **Caso A** (SDK suporta)
**Resultado:**
- Investigação: `node_modules/@sqds/multisig/lib/instructions/proposalCancel.d.ts` confirma que o SDK expõe `proposalCancel` (e também `proposalCancelV2`)
- Wrapper `proposalCancel` adicionado em `apps/web/lib/squads-sdk.ts` (mesmo padrão de `proposalApprove`/`proposalReject`, usando `sendSingleInstruction`)
- Frontend pode criar botão "Cancel" para proposals em `active`/`approved`

**Contexto:**
Permitir cancelar uma proposal em status `active`/`approved` antes da execução. `lib/squads-sdk.ts` ainda não expõe `cancel`. Verificar se o SDK `@sqds/multisig` v2.1.4 tem a instruction.

**Arquivo:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/lib/squads-sdk.ts`

**Investigação primeiro:**

```bash
# Procurar a instruction no SDK instalado
grep -rn "proposalCancel\|cancelProposal" node_modules/@sqds/multisig/lib --include="*.d.ts" | head
ls node_modules/@sqds/multisig/lib/instructions/ | grep -i cancel
```

**Caso A — SDK tem `proposalCancel`:**

Adicionar wrapper em `lib/squads-sdk.ts` seguindo o padrão dos wrappers existentes (`proposalApprove`, `proposalReject`):

```ts
// lib/squads-sdk.ts
export async function buildProposalCancelTx(args: {
  connection: Connection;
  multisigPda: PublicKey;
  transactionIndex: bigint;
  member: PublicKey;
  memo?: string;
}): Promise<Transaction> {
  const { connection, multisigPda, transactionIndex, member, memo } = args;

  const ix = multisig.instructions.proposalCancel({
    multisigPda,
    transactionIndex,
    member,
    memo,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: member, recentBlockhash: blockhash });
  tx.add(ix);
  return tx;
}
```

**Caso B — SDK NÃO tem `proposalCancel`:**

1. Não criar wrapper.
2. Documentar bloqueio em `docs/API_AUTH_MATRIX.md` ou novo `docs/SDK_LIMITATIONS.md`:
   ```md
   ## proposalCancel não disponível
   `@sqds/multisig@2.1.4` não expõe `proposalCancel` instruction.
   Cancel on-chain bloqueado até upgrade da SDK.
   Frontend deve usar apenas archive off-chain (ver TICKET #13b).
   ```
3. Comunicar ao frontend que o botão "Cancel" não pode existir nesta versão.

**Aceite:**
- [ ] Investigação documentada no PR description (qual caso)
- [ ] Caso A: wrapper exportado e segue padrão dos wrappers existentes
- [ ] Caso B: documentação clara de bloqueio
- [ ] `pnpm typecheck` passa

---

### TICKET #13b · Archive de proposals (DB + API)  ✅ DONE

**Severidade:** 🟢 Feature
**Estimativa:** 2h
**Implementado:** 30/04/2026
**Resultado:**
- Schema: campo `archivedAt DateTime?` + `@@index([cofreAddress, archivedAt])` em `ProposalDraft`
- Migration: `apps/web/prisma/migrations/20260430120000_proposal_archive/migration.sql`
- `serializeDraft` expõe `archivedAt: string | null` (ISO ou null)
- PATCH `/api/proposals/[multisig]/[index]` com auth + rate limit + zod (`{ action: "archive" | "unarchive" }`)
- GET listagem aceita `?includeArchived=true` (default exclui archived)

**Contexto:**
Soft-delete off-chain de proposal drafts. Não toca on-chain. Frontend usa toggle "Show archived".

**Arquivos:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/prisma/schema.prisma`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/api/proposals/[multisig]/[index]/route.ts`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/api/proposals/[multisig]/route.ts` (filtro)
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/lib/serialize-proposal-draft.ts` (expor `archivedAt`)

**Implementação:**

1. **Schema migration:**
   ```prisma
   model ProposalDraft {
     // ... campos existentes
     archivedAt  DateTime?
     @@index([multisig, archivedAt])
   }
   ```

2. **Gerar migration:**
   ```bash
   pnpm -F web prisma migrate dev --name proposal-archive
   ```

3. **Endpoint PATCH** (atualizar `/api/proposals/[multisig]/[index]/route.ts`):
   ```ts
   const archiveSchema = z.object({
     action: z.enum(["archive", "unarchive"]),
   });

   export async function PATCH(req: Request, ctx: { params: { multisig: string; index: string } }) {
     const auth = await requireWalletAuth();
     if (auth instanceof NextResponse) return auth;

     const rate = await checkRateLimit(`patch-proposal-${auth.publicKey}`, 30, 60_000);
     if (!rate.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

     const params = await ctx.params;
     const body = await req.json().catch(() => null);
     const parsed = archiveSchema.safeParse(body);
     if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

     const draft = await prisma.proposalDraft.update({
       where: {
         multisig_transactionIndex: {
           multisig: params.multisig,
           transactionIndex: BigInt(params.index),
         },
       },
       data: { archivedAt: parsed.data.action === "archive" ? new Date() : null },
     });

     return NextResponse.json({ ok: true, draft: serializeDraft(draft) });
   }
   ```

4. **GET listagem com filtro `?includeArchived=true`** em `/api/proposals/[multisig]/route.ts`:
   ```ts
   const url = new URL(req.url);
   const includeArchived = url.searchParams.get("includeArchived") === "true";

   const drafts = await prisma.proposalDraft.findMany({
     where: {
       multisig: params.multisig,
       ...(includeArchived ? {} : { archivedAt: null }),
     },
     orderBy: { transactionIndex: "desc" },
   });
   ```

5. **Atualizar `serializeDraft`** para expor `archivedAt: string | null` (ISO).

**Contrato com frontend (importante):**
- PATCH body: `{ action: "archive" | "unarchive" }`
- Resposta: `{ ok: true, draft: ProposalDraftDto }`
- GET listagem default: `archivedAt = null` (não retorna archived)
- GET com `?includeArchived=true`: retorna todos
- DTO ganha campo `archivedAt: string | null`

**Aceite:**
- [ ] Migration aplicada (`prisma migrate status` OK)
- [ ] PATCH `/api/proposals/<ms>/<idx>` com `{action:"archive"}` retorna 200 e seta `archivedAt`
- [ ] GET sem flag não retorna archived
- [ ] GET com flag retorna todos
- [ ] Auth obrigatória no PATCH (401 sem header)
- [ ] Rate limit funciona
- [ ] `serializeDraft` testado expõe `archivedAt`

---

### TICKET #15b · Helper para listar membros do Squads (read-only on-chain)  ✅ DONE

**Severidade:** 🟢 Feature
**Estimativa:** 30min
**Implementado:** 30/04/2026
**Resultado:**
- `loadMultisigInfo()`, types `MultisigInfo` e `MultisigMember` exportados de `apps/web/lib/squads-sdk.ts`
- Permission bitmask validado contra `node_modules/@sqds/multisig/lib/index.js`: `Initiate=1`, `Vote=2`, `Execute=4`
- Inclui campos extras: `threshold`, `timeLock`, `transactionIndex`, `staleTransactionIndex`
- Não cria endpoint API — chamada client-side via `useConnection()`

**Contexto:**
Tab "Members" da página Settings precisa listar signatários do multisig. Dado é público on-chain — não precisa de DB.

**Arquivo:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/lib/squads-sdk.ts` (adicionar helper)

**Investigar:**
```bash
grep -n "Multisig\.fromAccountAddress\|multisig.accounts" apps/web/lib/squads-sdk.ts
```

O Squads SDK expõe `Multisig.fromAccountAddress(connection, multisigPda)` que retorna a conta com `members: Member[]` (cada `Member` tem `key: PublicKey` e `permissions: Permissions`).

**Implementação:**

```ts
// lib/squads-sdk.ts
import * as multisig from "@sqds/multisig";

export type MultisigMember = {
  publicKey: string;
  permissions: {
    initiate: boolean;
    vote: boolean;
    execute: boolean;
  };
};

export type MultisigInfo = {
  threshold: number;
  members: MultisigMember[];
  transactionIndex: string;
  staleTransactionIndex: string;
};

export async function loadMultisigInfo(args: {
  connection: Connection;
  multisigPda: PublicKey;
}): Promise<MultisigInfo> {
  const { connection, multisigPda } = args;
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);

  return {
    threshold: ms.threshold,
    transactionIndex: ms.transactionIndex.toString(),
    staleTransactionIndex: ms.staleTransactionIndex.toString(),
    members: ms.members.map((m) => ({
      publicKey: m.key.toBase58(),
      permissions: {
        initiate: (m.permissions.mask & 1) !== 0,
        vote: (m.permissions.mask & 2) !== 0,
        execute: (m.permissions.mask & 4) !== 0,
      },
    })),
  };
}
```

(Verificar valores reais das máscaras de permissão na SDK — Squads v4 usa bitmask. Se os valores acima estiverem errados, ajustar conforme `node_modules/@sqds/multisig/lib/types.d.ts`.)

**Sem necessidade de endpoint API** — o frontend pode chamar o helper direto via `connection` do `useConnection()`.

**Contrato com frontend:**
- Importável: `import { loadMultisigInfo, type MultisigInfo } from "@/lib/squads-sdk"`
- Async, retorna `MultisigInfo`
- Throw em caso de account não encontrada — frontend trata.

**Aceite:**
- [ ] Helper exportado e tipado
- [ ] Permissions decoded corretamente (validar manualmente com 1 multisig de teste)
- [ ] Não cria endpoint API novo (chamada client-side é OK pois é dado público)
- [ ] `pnpm typecheck` passa

---

### TICKET #5-CONTRACT · Validar contratos da API antes do React Query (frontend)  ✅ DONE

**Severidade:** 🟡 Coordenação
**Estimativa:** 30min
**Implementado:** 30/04/2026
**Resultado:**
- `docs/API_CONTRACTS.md` criado com tipos TS completos para os **8 GETs públicos**
- Inclui `archivedAt: string | null` (TICKET #13b) backward-compatível
- Documenta query params (`?includeArchived=true`) e error responses (404, 410, 503)

**Contexto:**
Frontend vai migrar para React Query usando GETs públicos. Backend precisa **garantir que os endpoints existentes retornam shapes estáveis** e documentar.

**Procedimento:**

1. **Para cada GET listado em `API_AUTH_MATRIX.md` como público**, abrir o handler e documentar o shape de resposta.

2. **Criar `docs/API_CONTRACTS.md`:**

   ```md
   # API Contracts (GETs públicos consumidos pelo React Query)

   ## GET /api/proposals/[multisig]
   ```ts
   type Response = {
     drafts: ProposalDraftDto[];
   };

   type ProposalDraftDto = {
     multisig: string;
     transactionIndex: string;  // bigint serialized
     kind: "single" | "payroll";
     // ... campos completos
     archivedAt: string | null;  // novo (ver TICKET #13b)
   };
   ```

   ## GET /api/payrolls/[multisig]
   ```ts
   type Response = {
     payrolls: PayrollDraftDto[];
   };
   ```

   ... etc para todos os GETs públicos
   ```

3. **Confirmar que mudanças de contrato (#13b adiciona `archivedAt`) são backward-compatible** — campo opcional/nullable no TS, não obrigatório.

**Aceite:**
- [ ] `docs/API_CONTRACTS.md` criado com todos os GETs públicos
- [ ] Tipos copiáveis para `lib/types.ts` no frontend
- [ ] Mudanças de schema (#13b) refletidas no contrato

---

### TICKET #19 · Renomear commits (git history)  ⏸️ PENDENTE

**Severidade:** 🟢 Cleanup
**Estimativa:** 15min
**Status:** Não executado — exige coordenação com colaboradores antes de force-push.

Executar manualmente quando estiver pronto:

**Contexto:**
Commits problemáticos:
- `f7bc345` mensagem é o próprio comando git
- `1b7e60e` mensagem só "fix"
- `6095b85` poderia ser conventional

**Procedimento:**

```bash
git fetch origin
git log --oneline --reverse 6095b85~1..HEAD   # revisar range antes
git rebase -i 6095b85~1
# Editor: trocar 'pick' por 'reword' apenas nos commits alvo.
# Atenção: range pode incluir commits extras; não reword fora do escopo.
# Mensagens novas:
#   f7bc345 → fix(web): remove duplicate header from vault dashboard
#   1b7e60e → fix(web): proposals page minor fixes
#   6095b85 → feat(web): add vault session storage, clean up legacy texts
git push --force-with-lease origin <branch>
```

⚠️ **Coordenar com colaboradores antes do force-push.**

**Aceite:**
- [ ] `git log --oneline --reverse 6095b85~1..HEAD` revisado antes do rebase
- [ ] `git log --oneline -8` mostra mensagens conventional nos commits alvo
- [ ] `git push` com `--force-with-lease` aceito
- [ ] Confirmação dos colaboradores

---

### TICKET #20 · Idempotência da proposal de inicialização (gap das Melhorias §1.1)  ✅ DONE

**Severidade:** 🟡 Confiabilidade (multi-membro)
**Estimativa:** 1–2h
**Implementado:** 30/04/2026
**Resultado:**
- Endpoint `GET /api/proposals/[multisig]/init-status` criado (público, sem auth)
- Lê on-chain a `Multisig` account via `@sqds/multisig` (server-side, usa `NEXT_PUBLIC_RPC_URL`)
- Escaneia `staleTransactionIndex+1` até `transactionIndex` buscando Proposal accounts com status `Draft/Active/Approved/Executing`
- Retorna `{ hasPendingInit, pendingTxIndex, pendingProposalPda, onChainTransactionIndex, onChainStaleTransactionIndex, dbDraftCount }`
- DB count de drafts não-arquivados como sinal suplementar
- Documentado em `docs/API_AUTH_MATRIX.md` e `docs/API_CONTRACTS.md`
- Frontend pode desabilitar botão "Initialize Vault" quando `hasPendingInit = true`

**Arquivo:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/api/proposals/[multisig]/init-status/route.ts`

**Aceite:**
- [x] Endpoint GET exposto com a forma acima
- [x] Documentado em `docs/API_AUTH_MATRIX.md` e `docs/API_CONTRACTS.md`
- [ ] FE consegue desabilitar botão quando `hasPendingInit = true` (frontend)

---

## 2. Ordem de execução recomendada

```
1. TICKET #1     (Prisma)             — bloqueador, faz primeiro            [✅ DONE]
2. TICKET #4-AUDIT                    — gera doc que frontend precisa       [✅ DONE]
3. TICKET #5-CONTRACT                 — gera doc complementar               [✅ DONE]
4. TICKET #15b   (loadMultisigInfo)   — pequeno, isola                      [✅ DONE]
5. TICKET #13a   (proposalCancel)     — investigação SDK                    [✅ DONE — Caso A]
6. TICKET #13b   (archive DB+API)     — depende de migrations OK (#1)       [✅ DONE]
7. TICKET #20    (init idempotência)  — gap descoberto vs MELHORIAS §1.1    [✅ DONE]
8. TICKET #19    (rebase)             — por último, em coordenação          [⏸️ PENDENTE]
```

Tickets **#13a** e **#13b** podem ser feitos em paralelo (arquivos diferentes).

---

## 3. Coordenação com track frontend

Sinais para o frontend após cada ticket:

| Concluído | Frontend pode | Como sinalizar |
|---|---|---|
| #1 Prisma | Endpoints respondem 200 | commit + mensagem |
| #4-AUDIT | Migrar `fetchWithAuth` → `fetch` em GETs públicos (TICKET #4-frontend) | commit do `API_AUTH_MATRIX.md` |
| #5-CONTRACT | Tipar `useProposals`, `usePayrolls` com shapes documentados | commit do `API_CONTRACTS.md` |
| #13a (Caso A/B) | Criar/não criar botão Cancel | mensagem clara: "SDK suporta" ou "SDK não suporta" |
| #13b | Implementar toggle "Show archived" e botão Archive | doc de contrato atualizado |
| #15b | Construir tab Members consumindo `loadMultisigInfo` | commit do helper |

---

## 4. Validação antes de cada commit

```bash
pnpm lint
pnpm typecheck
pnpm -F web build
# Se mudou Prisma:
pnpm -F web prisma generate
pnpm -F web prisma validate
```

---

## 5. Comandos diagnósticos

```bash
# Listar todos handlers e classificar auth
for f in $(find apps/web/app/api -name route.ts); do
  echo "=== $f ==="
  grep -E "export async function (GET|POST|PATCH|DELETE)|requireWalletAuth|verifyWalletAuth" "$f"
done

# Ver migrations pendentes
pnpm -F web prisma migrate status

# Conferir DATABASE_URL ativa
echo $DATABASE_URL | sed 's/:.*@/:***@/'

# Inspecionar SDK Squads
ls node_modules/@sqds/multisig/lib/instructions/
```

---

## 6. Apêndice — referências cruzadas

- **Plano estratégico:** `docs/MELHORIAS_DETALHADAS.md`
- **Playbook completo (FE+BE):** `docs/IMPLEMENTATION_PLAYBOOK.md`
- **Track frontend:** trabalhando em paralelo, consome `API_AUTH_MATRIX.md` e `API_CONTRACTS.md`

**Não fazer aqui (é frontend):**
- Tickets #2, #3, #6, #7, #8, #9, #10, #11, #12, #14, #16, #17, #18
- Porção UI dos tickets #4 (consumo), #13c (botões), #15a/c/d/e/f (tabs)

**Itens do `MELHORIAS_DETALHADAS.v1.md.bak` que são puramente frontend e não entram no escopo backend:**
- §1.2 Sincronização de status (badge, listas, React Query)
- §1.4 Shielded balance travado (chamada Cloak SDK no FE)
- §2 Modais de progresso, redesigns (Dashboard, Operator, Payroll, Proposal Detail)
- §3 Audit — revisão UX (backend já provê os endpoints necessários)
- §4 Settings — nova página (backend só fornece helpers, já entregue em #15b)
- §5 Addresses — wallet do operator
- §6 Header dropdown multi-vault (sessionStorage)
- §7 Refinamento geral
- §8 Landing page — animações e copy
- §9 Mobile — responsividade
