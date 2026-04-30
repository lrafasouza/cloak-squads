# Aegis — Implementation Playbook

> Spec executável. Cada ticket é autocontido: contexto, arquivos, estado atual, código alvo, critérios de aceite. Um agente deve conseguir pegar um ticket e implementar sem precisar de mais contexto.
>
> **Pareie com** `docs/MELHORIAS_DETALHADAS.md` (visão estratégica). Este doc é o "como fazer".

---

## 0. Mapa do Repositório (o que agentes precisam saber)

```
cloak-squads/                          (monorepo pnpm + turbo)
├── apps/web/                          (Next.js 15 App Router, único front)
│   ├── app/
│   │   ├── page.tsx                   landing
│   │   ├── layout.tsx                 root (providers globais)
│   │   ├── globals.css                design tokens (HSL vars)
│   │   ├── api/                       route handlers (Prisma)
│   │   └── vault/[multisig]/          área autenticada
│   │       ├── layout.tsx             wraps com AppShell
│   │       ├── page.tsx               dashboard (632 linhas — decompor)
│   │       ├── send/page.tsx
│   │       ├── payroll/page.tsx
│   │       ├── operator/page.tsx
│   │       ├── invoice/page.tsx
│   │       ├── proposals/page.tsx
│   │       ├── proposals/[id]/page.tsx
│   │       └── audit/page.tsx
│   ├── components/
│   │   ├── app/AppShell.tsx           sidebar + topbar (envolve /vault/*)
│   │   ├── app/OperatorInboxSheet.tsx
│   │   ├── brand/Logo.tsx             "aegis" lowercase intencional
│   │   ├── landing/HeroDiagram.tsx
│   │   ├── site/SiteHeader.tsx        header da landing
│   │   ├── ui/                        primitivos (button, card, etc)
│   │   ├── ui/aegis/                  Address, etc
│   │   ├── ui/transaction-progress.tsx (provider + modal)
│   │   ├── ui/toast-provider.tsx       (artesanal — substituir por sonner)
│   │   └── wallet/                     WalletGuard, ClientWalletButton, providers
│   ├── lib/
│   │   ├── prisma.ts                   client lazy + isPrismaAvailable()
│   │   ├── proposals.ts                helpers para Squads proposals
│   │   ├── squads-sdk.ts               wrappers do Squads v4 (16KB)
│   │   ├── use-wallet-auth.ts          hook fetchWithAuth — assina mensagem
│   │   ├── wallet-auth.ts              backend auth verifier
│   │   ├── env.ts                      typed env vars
│   │   ├── status-labels.ts            mapping status → label/cor
│   │   ├── payroll-csv.ts              parser CSV
│   │   └── gatekeeper-instructions.ts  CPI helpers
│   └── prisma/schema.prisma            postgresql provider
├── packages/core/                      shared utils (workspace:*)
├── programs/                           Anchor programs
├── docs/
│   ├── MELHORIAS_DETALHADAS.md         plano estratégico (este projeto)
│   └── IMPLEMENTATION_PLAYBOOK.md      este arquivo
└── .windsurf/workflows/                (vazio por enquanto)
```

### Convenções do projeto

| Item | Padrão |
|---|---|
| Linter/formatter | Biome (`pnpm lint`, `pnpm format`) |
| Type check | `pnpm typecheck` na raiz |
| Imports | Path alias `@/` aponta para `apps/web/` |
| State | React hooks + zustand (instalado, ainda não consolidado) |
| Server state | React Query 5 (`@tanstack/react-query`) |
| Toast | **Sonner** (preferir) — `toast-provider.tsx` é legado |
| Modal/sheet | `vaul` (instalado, pouco usado) |
| Animações | `framer-motion` 11 |
| Form | hoje `useState` artesanal — alvo: `react-hook-form` |
| Validação | `zod` (instalado) |
| Ícones | `lucide-react` — **nunca** SVG inline |
| Cores | tokens HSL em `globals.css` — **nunca** hardcoded |
| Numerais | `font-mono tabular-nums` — sempre |
| Wallet auth | `useWalletAuth().fetchWithAuth(url)` — assina msg `aegis:<pk>:<ts>` |
| Commits | conventional: `feat(web):`, `fix(web):`, `refactor(web):` |

### Design tokens (resumo, ver `globals.css`)

```css
--bg, --surface, --surface-2, --surface-3   /* superfícies dark */
--border, --border-strong                    /* divisórias */
--ink, --ink-muted, --ink-subtle             /* texto: 96%, 65%, 46% */
--accent, --accent-hover, --accent-soft      /* gold #C9A86A */
--accent-ink                                 /* dark, p/ texto sobre accent */
--signal-positive, --signal-warn, --signal-danger
--ring (= accent), --radius (10px)
```

Uso Tailwind: `bg-bg`, `bg-surface`, `text-ink-muted`, `border-border`, `bg-accent`, etc.

---

## 1. Tickets — Bugs Críticos

---

### TICKET #1 · Fix Prisma DATABASE_URL mismatch

**Severidade:** 🔴 Bloqueador
**Estimativa:** 30min

**Contexto:**
`prisma/schema.prisma` declara `provider = "postgresql"` e as migrations versionadas também são PostgreSQL (`prisma/migrations/migration_lock.toml`). Porém `.env.example` usa `DATABASE_URL=file:./dev.db` (SQLite). API routes que usam Prisma quebram em runtime com erro de protocolo.

**Arquivos:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/prisma/schema.prisma:5-8`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/prisma/migrations/migration_lock.toml:3`
- `/Users/rafazaum/Desktop/cloak-squads/.env.example:20-22`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/lib/prisma.ts:39-41`

**Estado atual:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
```
DATABASE_URL=file:./dev.db
```
```ts
export function isPrismaAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
```

**Decisão do playbook: manter PostgreSQL.**
Não trocar `provider` para SQLite neste ticket. O repositório já tem migrations PostgreSQL com tipos como `BYTEA`; mudar para SQLite exige reset/reescrita de migrations e deve ser um projeto separado.

**Implementação:**

1. Atualizar `.env.example:20-22`:
   ```env
   # Local dev:  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegis_dev
   # Production: DATABASE_URL=postgresql://... (Render PostgreSQL or Supabase)
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegis_dev
   ```
2. Se não existir setup local, adicionar `docker-compose.yml` na raiz:
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgres
         POSTGRES_DB: aegis_dev
       ports:
         - "5432:5432"
       volumes:
         - aegis-postgres:/var/lib/postgresql/data

   volumes:
     aegis-postgres:
   ```
3. Atualizar `lib/prisma.ts:39-41`:
   ```ts
   export function isPrismaAvailable(): boolean {
     const url = process.env.DATABASE_URL;
     if (!url) return false;
     return url.startsWith("postgresql://") || url.startsWith("postgres://");
   }
   ```
4. Rodar:
   ```bash
   docker compose up -d postgres
   pnpm -F web prisma migrate dev
   ```
5. Opcional: adicionar nota em README/dev docs com a URL local.

**Aceite:**
- [ ] `pnpm -F web build` passa sem erro Prisma
- [ ] `curl localhost:3000/api/payrolls/<multisig>` retorna 200 (ou 400 com erro de pubkey, não 500 do Prisma)
- [ ] Console de dev sem mensagem `the URL must start with the protocol postgresql://`
- [ ] `apps/web/prisma/migrations/migration_lock.toml` continua `provider = "postgresql"`

---

### TICKET #2 · OperatorInbox — filtro invertido

**Severidade:** 🔴 Bug funcional
**Estimativa:** 15min

**Contexto:**
A inbox do operator deve listar proposals **prontas para executar**. No fluxo atual do Squads, a tela de detalhe bloqueia execução salvo quando `status === "approved"`. Portanto `active` ainda precisa de assinaturas e `executed` já saiu da fila. O código atual filtra `executed` com `hasDraft`, invertendo a fila.

**Arquivo:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/components/app/AppShell.tsx:200-215`

**Estado atual:**
```ts
const ready = mergeProposalSummaries(persisted, onchain)
  .filter((proposal) => proposal.hasDraft && proposal.status === "executed")
  .map((proposal): OperatorInboxItem => ({ ... status: "pending" }));
```

**Status disponíveis hoje:**
- `ProposalStatusKind` em `lib/proposals.ts`: `draft | active | approved | rejected | executing | executed | cancelled | unknown`.
- `proposals/[id]/page.tsx` calcula `executeBlocked = status !== "approved"`.

**Implementação:**
```ts
const ready = mergeProposalSummaries(persisted, onchain)
  .filter((p) => p.hasDraft && p.status === "approved")
  .map((proposal): OperatorInboxItem => ({ ... status: "pending" }));
```

**Aceite:**
- [ ] Proposal `active` sem threshold suficiente **não** aparece na inbox
- [ ] Proposal `approved` com draft persistido aparece na inbox
- [ ] Após executar, ela **sai** da inbox
- [ ] Badge no header reflete a contagem correta
- [ ] Test manual: active 0 → approved 1 → executed 0 ao longo do flow

---

### TICKET #3 · Bloquear múltiplas init proposals

**Severidade:** 🔴 Bug
**Estimativa:** 1h

**Contexto:**
Bug 1.1 do plano. `vault/[multisig]/page.tsx:120-263` cria proposal de inicialização sem lock idempotente. Click duplo ou refresh durante criação pode gerar duplicatas.

**Arquivo principal:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/vault/[multisig]/page.tsx:120-263` (função `initializeCofre`)

**Investigar:**
- Como listar proposals via `lib/squads-sdk.ts` ou `lib/proposals.ts`.
- Importante: hoje `ProposalSummary.type` é apenas `"single" | "payroll" | "onchain"`. Não existe `type === "init_cofre"`.
- `loadOnchainProposalSummaries()` lê a `Proposal` account, mas não lê memo/instructions da `VaultTransaction`; portanto não dá para detectar init on-chain de forma confiável sem ampliar esse helper.

**Implementação:**

1. **Adicionar helpers locais no dashboard**:
   ```ts
   function pendingInitKey(multisig: string) {
     return `pending-init-${multisig}`;
   }

   function readPendingInit(multisig: string): string | null {
     if (typeof window === "undefined") return null;
     return sessionStorage.getItem(pendingInitKey(multisig));
   }

   function writePendingInit(multisig: string, value: string) {
     sessionStorage.setItem(pendingInitKey(multisig), value);
   }
   ```

2. **Bloquear reentrada antes de qualquer assinatura**:
   ```ts
   // adicionar useRef ao import de React existente
   const inFlightRef = useRef(false);

   async function initializeCofre() {
     if (!multisigAddress || inFlightRef.current || bootstrapPending) return;

     const pending = readPendingInit(multisigAddress.toBase58());
     if (pending) {
       addToast(`Initialization proposal #${pending} is already pending.`, "info");
       setBootstrapProposalIndex(pending);
       return;
     }

     inFlightRef.current = true;
     setBootstrapPending(true);
     try {
       // existing initialize flow...
       const bootstrap = await createInitCofreProposal(...);
       const index = bootstrap.transactionIndex.toString();
       writePendingInit(multisigAddress.toBase58(), index);
       setBootstrapProposalIndex(index);
     } finally {
       inFlightRef.current = false;
       setBootstrapPending(false);
     }
   }
   ```

3. **Desabilitar UI e mostrar link quando houver pending index**:
   ```tsx
   <Button disabled={bootstrapPending || !wallet.publicKey || Boolean(bootstrapProposalIndex)}>
     {bootstrapPending ? "Initializing..." : "Initialize vault"}
   </Button>
   {bootstrapProposalIndex ? (
     <Link href={`/vault/${multisig}/proposals/${bootstrapProposalIndex}`}>
       View pending proposal
     </Link>
   ) : null}
   ```

4. **Follow-up opcional para bloqueio on-chain real:**
   - Ampliar `loadOnchainProposalSummaries()` para ler a vault transaction e expor `memo`.
   - Derivar `kind: "init_cofre"` quando memo for `"Initialize Aegis vault"` ou `"init cofre"`.
   - Só depois usar filtro on-chain por `kind === "init_cofre"` e `status in ("active", "approved")`.

**Aceite:**
- [ ] Click duplo cria **apenas uma** proposal
- [ ] Refresh durante criação não duplica
- [ ] Mensagem clara se já existe pendente
- [ ] Botão fica disabled durante a operação
- [ ] Nenhum código usa `p.type === "init_cofre"` enquanto `ProposalSummaryType` não suportar esse valor

---

### TICKET #4 · Wallet auth lazy (não pedir signature em read-only)

**Severidade:** 🔴 UX
**Estimativa:** 2h

**Contexto:**
Bug 1.5 do plano. `useWalletAuth` (`lib/use-wallet-auth.ts`) não força signature no mount — só quando `fetchWithAuth` é chamado. O problema atual é que várias páginas chamam `fetchWithAuth` em `useEffect` no mount para GETs públicos → wallet abre popup sem ação explícita do usuário.

**Arquivos:**
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/lib/use-wallet-auth.ts:33-121`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/components/wallet/WalletGuard.tsx:1-70`
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/vault/[multisig]/audit/page.tsx:60-79` (`fetchWithAuth` no mount para GET público)
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/vault/[multisig]/operator/page.tsx:435-470` (`fetchWithAuth` no mount para GET público)
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/app/vault/[multisig]/proposals/[id]/page.tsx:120-160` (`fetchWithAuth` no mount para GET público)
- `/Users/rafazaum/Desktop/cloak-squads/apps/web/components/app/AppShell.tsx:177-223` importa `useWalletAuth`, mas os helpers atuais já usam `fetch` internamente
- Buscar todos os lugares: `grep -rn "fetchWithAuth" apps/web --include="*.tsx" --include="*.ts"`

**Estado atual:**
```ts
// audit/page.tsx:60
const res = await fetchWithAuth(
  `/api/audit-links/${encodeURIComponent(multisigAddress.toBase58())}`,
);

// operator/page.tsx:439
fetchWithAuth(`/api/proposals/${encodeURIComponent(multisig)}`)
```

**Estratégia:**

1. **Auditar quais endpoints API realmente precisam de signature.** Olhar `lib/wallet-auth.ts` (verifier) e ver quais routes em `app/api/` chamam `verifyWalletAuth`.
2. **GET públicos sem `requireWalletAuth`**: trocar `fetchWithAuth` → `fetch`.
   - `/api/proposals/[multisig]`
   - `/api/payrolls/[multisig]`
   - `/api/audit-links/[vault]`
3. **Endpoints autenticados**: manter `fetchWithAuth`, mas só chamar no momento da ação.
   - `POST /api/proposals`
   - `POST /api/payrolls`
   - `POST /api/stealth`
   - `POST /api/audit-links`
   - revoke/claim/utxo writes
4. **Para a OperatorInbox**: remover `useWalletAuth` de `AppShell.tsx` se ele não for mais usado. `loadPersistedProposalSummaries()` já usa `fetch`, não `fetchWithAuth`.

**Implementação sugerida:**

```ts
// audit/page.tsx
const res = await fetch(`/api/audit-links/${encodeURIComponent(multisigAddress.toBase58())}`);

// operator/page.tsx
const [singleRes, payrollRes] = await Promise.all([
  fetch(`/api/proposals/${encodeURIComponent(multisig)}`),
  fetch(`/api/payrolls/${encodeURIComponent(multisig)}`),
]);
```

5. **Adicionar UI feedback** quando signature for necessária:
   ```tsx
   <button onClick={handleAction}>
     {needsSign ? "Sign to continue" : "Approve"}
   </button>
   ```

**Aceite:**
- [ ] Acessar `/vault/<addr>/audit/` **não** abre popup da wallet
- [ ] Acessar `/vault/<addr>/operator/` **não** abre popup
- [ ] Acessar `/vault/<addr>/` (dashboard) **não** abre popup
- [ ] Clicar em "Approve" em uma proposal **abre** o popup (esperado)
- [ ] Após signature válida, requests subsequentes não pedem (cache 4min funciona)
- [ ] `grep -rn "fetchWithAuth" apps/web/app/vault --include="*.tsx"` não mostra chamadas em `useEffect` de carregamento read-only

---

### TICKET #5 · Sincronizar status de proposals (React Query)

**Severidade:** 🔴 UX/correctness
**Estimativa:** 3h

**Contexto:**
Bug 1.2 do plano. Após approve/execute/reject, listas em outras páginas/abas continuam com status antigo. Causa: estado local sem invalidação.

**Implementação:**

1. **Centralizar query keys:**
   ```ts
   // lib/query-keys.ts (novo)
   export const queryKeys = {
     proposals: (multisig: string) => ['proposals', multisig] as const,
     proposalDetail: (multisig: string, id: string) => ['proposals', multisig, id] as const,
     drafts: (multisig: string) => ['drafts', multisig] as const,
     cofreStatus: (multisig: string) => ['cofre-status', multisig] as const,
   };
   ```

2. **Hook `useProposals`:**
   ```ts
   // lib/hooks/use-proposals.ts (novo)
   export function useProposals(multisig: string) {
     const { connection } = useConnection();
     return useQuery({
       queryKey: queryKeys.proposals(multisig),
       enabled: Boolean(multisig),
       queryFn: async () => {
         const ms = new PublicKey(multisig);
         const [persisted, onchain] = await Promise.all([
           loadPersistedProposalSummaries(ms),
           loadOnchainProposalSummaries({ connection, multisigAddress: ms }),
         ]);
         return mergeProposalSummaries(persisted, onchain);
       },
       staleTime: 20_000,
       refetchOnWindowFocus: false,
     });
   }
   ```

3. **Invalidar após mutations:**
   ```ts
   const qc = useQueryClient();
   const handleApprove = async () => {
     await proposalApprove(...);
     qc.invalidateQueries({ queryKey: queryKeys.proposals(multisig) });
     qc.invalidateQueries({ queryKey: queryKeys.proposalDetail(multisig, id) });
   };
   ```

4. **Migrar páginas:** `vault/[multisig]/page.tsx`, `proposals/page.tsx`, `proposals/[id]/page.tsx`, `operator/page.tsx`, `AppShell/OperatorInboxButton`.

   Não usar `refetchInterval` nas listas. Atualize por invalidação após ações (`create`, `archive`, `approve`, `reject`, `execute`) e deixe polling curto apenas na página de detalhe enquanto a proposal está em estado não-final.

5. **Não introduzir wallet auth no hook de listagem.** `GET /api/proposals/[multisig]` e `GET /api/payrolls/[multisig]` são públicos hoje; se isso mudar no futuro, criar um hook privado separado e chamá-lo apenas sob ação explícita do usuário.

**Aceite:**
- [ ] Aprovar/executar uma proposal invalida o cache compartilhado de summaries
- [ ] Executar proposal → desaparece da lista de "active" e aparece em "executed"
- [ ] Sem polling múltiplos requests duplicados (verificar Network tab)
- [ ] Entrar em `/vault/<addr>/proposals` não dispara assinatura de wallet

---

## 2. Tickets — Design System

---

### TICKET #6 · Limpar `transition-all`

**Severidade:** 🟡 Design quality
**Estimativa:** 30min

**Contexto:**
6 ocorrências detectadas. Anti-pattern: anima propriedades imprevistas, gera jank.

**Localizações exatas:**
```
apps/web/app/vault/[multisig]/payroll/page.tsx:668
apps/web/app/vault/[multisig]/page.tsx:577
apps/web/app/vault/[multisig]/operator/page.tsx:1300
apps/web/app/vault/[multisig]/proposals/[id]/page.tsx:291
apps/web/app/vault/[multisig]/proposals/[id]/page.tsx:462
apps/web/app/vault/[multisig]/proposals/page.tsx:132
```

**Substituições:**

| Caso | Trocar por |
|---|---|
| Hover em card (border + bg) | `transition-colors duration-200` |
| Botão com `active:scale-` | `transition-[background-color,border-color,transform]` |
| Progress bar (`bg-emerald-400`) | `transition-[width] duration-500` |

**Aceite:**
- [ ] `grep -rn "transition-all" apps/web --include="*.tsx"` → 0 resultados
- [ ] Hover/active states ainda funcionam visualmente

---

### TICKET #7 · Substituir cores soltas (emerald/purple/blue/amber) → tokens

**Severidade:** 🟡 Design quality
**Estimativa:** 2h

**Contexto:**
Direção institucional pede single accent + grayscale. Cores soltas quebram a identidade.

**Comando para mapear:**
```bash
grep -rn "bg-emerald\|bg-purple\|bg-blue\|bg-amber\|text-emerald\|text-purple\|text-blue\|text-amber\|border-emerald\|border-purple\|border-blue\|border-amber" \
  apps/web --include="*.tsx" > /tmp/color-audit.txt
```

**Mapeamento de substituição:**

| Atual | Trocar por | Quando |
|---|---|---|
| `bg-emerald-500` (CTA) | `bg-accent` | Botões primários |
| `bg-emerald-400` (progress) | `bg-accent` | Barras de progresso |
| `bg-emerald-950/20` (success bg) | `bg-accent-soft` ou `bg-surface-2` | Cards de sucesso |
| `text-emerald-400` | `text-signal-positive` | Texto de status positivo |
| `text-amber-*` | `text-signal-warn` | Avisos |
| `text-red-* / text-rose-*` | `text-signal-danger` | Erros |
| `bg-purple-*`, `bg-blue-*` | `bg-surface-2` ou remover | Backgrounds decorativos |
| `border-emerald-900/50` (hover) | `border-border-strong` | Hover de cards |

**Adicionar tokens** ao Tailwind config se faltar:
```ts
// apps/web/tailwind.config.ts
extend: {
  colors: {
    'signal-positive': 'hsl(var(--signal-positive))',
    'signal-warn': 'hsl(var(--signal-warn))',
    'signal-danger': 'hsl(var(--signal-danger))',
  }
}
```

**Aceite:**
- [ ] `grep -rn "bg-emerald\|bg-purple\|bg-blue\|bg-amber" apps/web --include="*.tsx"` → 0 resultados
- [ ] Páginas afetadas mantêm legibilidade (status ainda comunicam)
- [ ] Visual coerente com o accent gold

---

### TICKET #8 · SVGs inline → Lucide

**Severidade:** 🟡 Design quality
**Estimativa:** 2h

**Contexto:**
~40 SVGs escritos à mão no código. `lucide-react` já é dependência.

**Mapeamento típico:**

| SVG inline (path) | Lucide |
|---|---|
| Cofre/cadeado | `Lock`, `LockOpen`, `Vault` |
| Wallet | `Wallet` |
| Coin/$ | `Coins`, `DollarSign` |
| Lista/proposals | `List`, `FileText` |
| Check | `Check`, `CheckCircle2` |
| X/cancel | `X`, `XCircle` |
| Settings | `Settings`, `Settings2` |
| User/operator | `User`, `Users`, `Key` |
| Globe/audit | `Globe`, `Shield` |
| Arrow | `ArrowRight`, `ChevronRight` |
| Clock/time | `Clock`, `History` |

**Padrão de uso:**
```tsx
import { Lock } from "lucide-react";
<Lock className="h-4 w-4 text-ink-subtle" aria-hidden />
```

**Aceite:**
- [ ] Em `vault/[multisig]/page.tsx`: zero `<svg>` inline
- [ ] `grep -c "<svg" apps/web/app/vault/[multisig]/page.tsx` → 0
- [ ] Tamanhos consistentes: `h-4 w-4` (small), `h-5 w-5` (medium), `h-6 w-6` (large)

---

### TICKET #9 · Componente `<FormattedNumber>`

**Severidade:** 🟡 Consistência
**Estimativa:** 3h

**Contexto:**
Skill `number-formatting` pede componente padronizado para todo display numérico.

**Arquivo a criar:**
- `apps/web/components/ui/formatted-number.tsx`
- `apps/web/lib/format-number.ts` (helpers puros)

**API:**
```tsx
type NumberType = 'fiat_value' | 'stable_value' | 'token_amount' | 'token_price' | 'percent' | 'ratio';
type NumberContext = 'compact' | 'detailed';

<FormattedNumber
  value={1234.5}
  type="fiat_value"
  context="compact"          // → "$1.2K"
/>

<FormattedNumber
  value={0.00005835}
  type="token_price"          // → "$0.0₄58" (zero subscript)
/>

<FormattedNumber
  value={null}                // → "--"
  type="token_amount"
/>
```

**Implementação resumida** (ver skill `number-formatting` para spec completa):

```ts
// lib/format-number.ts
export function format({
  value, type, context = 'compact', tokenPriceUsd
}: FormatArgs): string {
  if (value == null || !isFinite(value as number)) return '--';
  const v = Number(value);
  if (v === 0) return zeroFor(type);
  const abs = Math.abs(v);
  // tiny marker
  if (abs < tinyThreshold(type)) return tinyMarker(type, v);
  // zero-subscript
  if (abs < 0.01 && shouldSubscript(type)) return zeroSubscript(v, type);
  // abbreviate
  if (context === 'compact' && abs >= 1000 && canAbbrev(type)) return abbreviate(v, type);
  // normal
  return normalFormat(v, type, context, tokenPriceUsd);
}
```

**Pipeline de decisão** (importante):
```
null/inf → "--"
v === 0 → zero específico ("$0.00", "0", "0.00%")
|v| < tinyThreshold → tiny marker ("<$0.01", "<0.01%")
|v| < 0.01 && type allows → zero-subscript ("0.0₄58")
compact && |v| >= 1000 && type allows → "1.2K"
default → "1,234.50" (com tabular-nums)
```

**CSS:** componente sempre aplica `font-mono tabular-nums`.

**Copy-to-clipboard:** retorna raw value, não a string formatada.

**Aceite:**
- [ ] Componente exportado e testado em ao menos 3 lugares (StatCards do dashboard)
- [ ] Testes unitários cobrem: zero, tiny, subscript, abbreviation, null, infinity
- [ ] Render `0.00005835` → `0.0₄58` com `aria-label="0.00005835"`
- [ ] `tabular-nums` sempre aplicado

---

### TICKET #10 · Decompor `vault/[multisig]/page.tsx` (632 → ~80 linhas)

**Severidade:** 🟡 Manutenibilidade
**Estimativa:** 4h

**Contexto:**
Plano detalhado em `MELHORIAS_DETALHADAS.md` seção 3.

**Estrutura alvo:**
```
app/vault/[multisig]/
├── page.tsx                        (~80 linhas)
└── _dashboard/
    ├── CofreInitBanner.tsx         (lógica + UI de inicialização)
    ├── StatCards.tsx               (3 cards com NumberFlow)
    ├── AddressesCard.tsx           (multisig + cofre PDA + vault PDA)
    ├── RecentProposals.tsx         (lista + empty state)
    └── hooks/
        ├── useCofreStatus.ts       (polling + state)
        └── useInitializeCofre.ts   (toda a função initializeCofre)
```

**Pattern de extração:**

1. **Hook primeiro** — extrair `useInitializeCofre` (linhas 120-263) com retorno `{ initialize, isPending, proposalIndex, error }`.
2. **Hook de status** — extrair `useCofreStatus` (linhas 73-114) com retorno `{ status, refresh, isLoading }`.
3. **Componentes UI** — receber props prontas, sem lógica de fetching.
4. **Page** — só compõe.

**Exemplo de target `page.tsx`:**
```tsx
export default function VaultDashboard() {
  const params = useParams<{ multisig: string }>();
  const multisigAddress = useMemo(() => safePubkey(params.multisig), [params.multisig]);
  if (!multisigAddress) return <InvalidAddressEmpty />;

  return (
    <PageStage>
      <CofreInitBanner multisig={multisigAddress} />
      <StatCards multisig={multisigAddress} />
      <div className="grid gap-4 md:grid-cols-3">
        <RecentProposals className="md:col-span-2" multisig={multisigAddress} />
        <AddressesCard multisig={multisigAddress} />
      </div>
    </PageStage>
  );
}
```

**Remover** (não migrar): o header interno (linhas 321-349). AppShell já cumpre.

**Aceite:**
- [ ] `wc -l app/vault/[multisig]/page.tsx` → < 100
- [ ] Cada subcomponente tem responsabilidade única e props tipadas
- [ ] Hooks reutilizáveis (testáveis isoladamente)
- [ ] Comportamento idêntico ao original (regression manual)

---

### TICKET #11 · Page entrance animations (storyboard pattern)

**Severidade:** 🟢 Polish
**Estimativa:** 2h por página

**Contexto:**
Skill `page-load-animations`. Hoje páginas aparecem todas de uma vez.

**Padrão alvo (copiar para qualquer page):**

```tsx
"use client";
import { motion, useReducedMotion } from "framer-motion";
import { createContext, useContext, useEffect, useState } from "react";

// ┌─ MOUNT TIMELINE ────────────────────────────┐
// │ 0ms    header                                │
// │ 80ms   banner (condicional)                  │
// │ 160ms  stat cards (stagger 60ms × 3)         │
// │ 380ms  primary content                       │
// │ 460ms  secondary panels                      │
// └──────────────────────────────────────────────┘
const TIMING = {
  HEADER: 0, BANNER: 80,
  STATS_START: 160, STATS_STAGGER: 60,
  PRIMARY: 380, SECONDARY: 460,
} as const;

const SPRING = { type: "spring" as const, stiffness: 280, damping: 28 };
const StageContext = createContext(99);

export function PageStage({ children }: { children: React.ReactNode }) {
  const prefersReduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (prefersReduced) { setStage(99); return; }
    const timers = [
      setTimeout(() => setStage(s => Math.max(s, 1)), TIMING.HEADER),
      setTimeout(() => setStage(s => Math.max(s, 2)), TIMING.STATS_START),
      setTimeout(() => setStage(s => Math.max(s, 3)), TIMING.PRIMARY),
      setTimeout(() => setStage(s => Math.max(s, 4)), TIMING.SECONDARY),
    ];
    return () => timers.forEach(clearTimeout);
  }, [prefersReduced]);
  return <StageContext.Provider value={stage}>{children}</StageContext.Provider>;
}

export function StageItem({ at, children }: { at: number; children: React.ReactNode }) {
  const stage = useContext(StageContext);
  const visible = stage >= at;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={SPRING}
    >{children}</motion.div>
  );
}
```

**Regras (não-negociáveis):**
- ASCII storyboard no topo do arquivo
- TIMING object nomeado (sem magic numbers)
- `stage >= N` (sections ficam visíveis depois que aparecem)
- `useReducedMotion` respeitado
- Spring physics, não duration linear
- **Nunca** `staggerChildren` com `AnimatePresence`

**Aceite:**
- [ ] Dashboard tem entrance choreography
- [ ] `prefers-reduced-motion: reduce` mostra tudo imediatamente
- [ ] Sem flash de conteúdo (FOUC)

---

### TICKET #12 · NumberFlow nos balances

**Severidade:** 🟢 Polish
**Estimativa:** 1h

**Contexto:**
`@number-flow/react` instalado, nunca usado. Anima rolling de números — perfeito para balances que atualizam.

**Onde aplicar:**
- StatCards do dashboard (Available SOL, Shielded balance, Pending proposals count)
- Operator inbox count badge
- Payroll summary (total amount, recipient count)

**Padrão:**
```tsx
import NumberFlow from '@number-flow/react';

<NumberFlow
  value={balance}
  format={{ minimumFractionDigits: 2, maximumFractionDigits: 4 }}
  className="font-mono tabular-nums text-2xl font-bold text-ink"
/>
```

**Para token amounts**, combinar com `<FormattedNumber>` (TICKET #9): `NumberFlow` para mount/update animation, `FormattedNumber` formatter para o display correto.

**Aceite:**
- [ ] StatCards animam ao montar (rolling de 0 → valor)
- [ ] Updates suaves quando o valor muda
- [ ] `prefers-reduced-motion` respeitado (NumberFlow tem suporte nativo)

---

## 3. Tickets — Novas Features

---

### TICKET #13 · Cancel/Archive de proposals

**Severidade:** 🟢 Feature
**Estimativa:** 4h

**Contexto:**
Plano seção 1.3.

**Sub-tarefas:**

**13a. Cancel (on-chain) para proposals pending:**
- `lib/squads-sdk.ts` ainda não expõe cancel. Adicionar wrapper `proposalCancel()` usando `multisig.instructions.proposalCancel` se disponível na versão instalada de `@sqds/multisig`; se a SDK não tiver essa instruction, marcar cancel on-chain como bloqueado e implementar apenas archive off-chain.
- Add botão "Cancel proposal" em `proposals/[id]/page.tsx`.
- Permissão: seguir a regra da instruction Squads instalada. Não inventar permissão no front além de uma checagem UX; o programa on-chain é fonte de verdade.
- Confirmação modal (vaul drawer mobile, dialog desktop).
- Após sucesso: invalidar queries (TICKET #5 deve estar pronto).

**13b. Archive (off-chain) para finalizadas:**
- Add coluna `archivedAt DateTime?` ao model `ProposalDraft` em `schema.prisma`.
- Migration: `pnpm -F web prisma migrate dev --name proposal-archive`.
- Toggle "Show archived" na lista. Default oculto.
- Action: PATCH `/api/proposals/[multisig]/[id]` com `{ archivedAt: now }`.

**Aceite:**
- [ ] Se `proposalCancel` existir na SDK: cancel funciona on-chain (verificar via explorer)
- [ ] Se `proposalCancel` não existir: UI não promete cancel on-chain e o ticket registra o bloqueio
- [ ] Archive não deleta on-chain, só esconde na UI
- [ ] Toggle "Show archived" mostra novamente

---

### TICKET #14 · Vault Switcher no header

**Severidade:** 🟢 Feature
**Estimativa:** 3h

**Contexto:**
Plano seção 10.

**Arquivos a criar/modificar:**
- `apps/web/lib/stores/vault-store.ts` (novo, zustand persist)
- `apps/web/components/app/VaultSwitcher.tsx` (novo)
- `apps/web/components/app/AppShell.tsx:104-105` (substituir o `<Address>`)

**Store:**
```ts
// lib/stores/vault-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Vault = { address: string; name?: string; addedAt: number };
type VaultStore = {
  vaults: Vault[];
  add: (address: string, name?: string) => void;
  remove: (address: string) => void;
  rename: (address: string, name: string) => void;
};

export const useVaultStore = create<VaultStore>()(
  persist(
    (set) => ({
      vaults: [],
      add: (address, name) => set((s) => ({
        vaults: s.vaults.find(v => v.address === address)
          ? s.vaults
          : [...s.vaults, { address, name, addedAt: Date.now() }],
      })),
      remove: (address) => set((s) => ({ vaults: s.vaults.filter(v => v.address !== address) })),
      rename: (address, name) => set((s) => ({
        vaults: s.vaults.map(v => v.address === address ? { ...v, name } : v),
      })),
    }),
    { name: 'aegis-vaults' }
  )
);
```

**Component (esqueleto):**
```tsx
// VaultSwitcher.tsx
"use client";
import { useVaultStore } from "@/lib/stores/vault-store";
import { Check, ChevronDown } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function truncate(address: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-6)}` : "";
}

export function VaultSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ multisig: string }>();
  const current = params?.multisig ?? "";
  const { vaults, add } = useVaultStore();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (current) add(current); }, [current, add]);

  function switchVault(address: string) {
    const nextPath = pathname.replace(`/vault/${current}`, `/vault/${address}`);
    router.push(nextPath);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2"
      >
        <span className="text-eyebrow">Vault</span>
        <code className="font-mono text-sm">{truncate(current)}</code>
        <ChevronDown className="h-3 w-3 text-ink-subtle" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-surface p-2 shadow-raise-2">
          {vaults.map((vault) => (
            <button
              key={vault.address}
              type="button"
              onClick={() => switchVault(vault.address)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2"
            >
              {vault.address === current ? <Check className="h-4 w-4 text-accent" /> : <span className="h-4 w-4" />}
              <span className="min-w-0 flex-1 truncate">{vault.name ?? truncate(vault.address)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

**Nota:** Não assumir `@/components/ui/popover`; o repo não tem Radix Popover instalado hoje. Se optar por Radix/shadcn, adicionar a dependência explicitamente e manter o componente acessível. O esqueleto acima evita dependência nova.

**Aceite:**
- [ ] Vault atual sempre persistido em localStorage
- [ ] Switcher mostra todos os vaults adicionados
- [ ] Trocar vault navega para `/vault/<new>/` mantendo a sub-rota
- [ ] Remove pede confirmação

---

### TICKET #15 · Settings page

**Severidade:** 🟢 Feature
**Estimativa:** 6h (split em sub-tickets)

**Contexto:**
Plano seção 9. Criar em `app/vault/[multisig]/settings/page.tsx`.

**Tabs (cada um pode ser sub-ticket):**

**15a — General:** nome do vault (zustand store, TICKET #14), idioma placeholder.

**15b — Members:** read-only do Squads. Usar `lib/squads-sdk.ts` para fetch dos signers.

**15c — Operator:** wallet atual + change (cria proposal).

**15d — Notifications:** opt-in para `Notification` API browser. Storage em localStorage.

**15e — Appearance:** instalar `next-themes`, dark/light toggle. Hoje é dark hardcoded — adicionar `:root.light` em `globals.css` com tokens claros.

**15f — Danger zone:** remove do switcher, clear sessionStorage cache, logout (limpa `aegis-wallet-auth`).

**Aceite por sub-ticket:**
- [ ] Tab funcional standalone
- [ ] Mudanças persistem
- [ ] Mobile-friendly (vaul drawer ou tabs verticais)

---

### TICKET #16 · Command Palette (cmdk)

**Severidade:** 🟢 Feature/Polish
**Estimativa:** 3h

**Contexto:**
Plano seção 4. Power users navegam mais rápido.

**Instalar:**
```bash
pnpm -F web add cmdk
```

**Componente:**
- `apps/web/components/app/CommandPalette.tsx`
- Trigger: `⌘K` / `Ctrl+K` global.
- Mount no `AppShell` ou no `RootLayout`.

**Comandos mínimos:**
- Navegação: Overview, Send, Payroll, Operator, Invoices, Proposals, Audit, Settings.
- Ações: New send, New payroll, Copy multisig address, Switch vault, Disconnect wallet.
- Search: proposals (futuro).

**Aceite:**
- [ ] `⌘K` abre/fecha
- [ ] Esc fecha
- [ ] Setas + Enter navegam
- [ ] Mobile: oculto ou disponível via long-press menu

---

### TICKET #17 · Lenis smooth scroll na landing

**Severidade:** 🟢 Polish
**Estimativa:** 30min

**Contexto:**
`lenis` instalado, CSS já preparado em `globals.css:108-121` e já existe `components/providers/LenisProvider.tsx`. Falta montar o provider no escopo correto e respeitar reduced-motion.

**Implementação:**
```tsx
// components/providers/LenisProvider.tsx
useEffect(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
    smoothWheel: true,
  });

  let frame = 0;
  function raf(time: number) {
    lenis.raf(time);
    frame = requestAnimationFrame(raf);
  }
  frame = requestAnimationFrame(raf);

  return () => {
    cancelAnimationFrame(frame);
    lenis.destroy();
  };
}, []);
```

Montar apenas na landing para não interferir em telas operacionais:
```tsx
// app/page.tsx
import { LenisProvider } from "@/components/providers/LenisProvider";

export default function LandingPage() {
  return (
    <LenisProvider>
      {/* existing landing content */}
    </LenisProvider>
  );
}
```

**Aceite:**
- [ ] Scroll na landing tem inércia suave
- [ ] Anchor links (#how, #usecases) funcionam suavemente
- [ ] `prefers-reduced-motion`: scroll nativo
- [ ] Sem afetar áreas `data-lenis-prevent` (menus, modais)

---

### TICKET #18 · Sonner: substituir toast-provider artesanal

**Severidade:** 🟡 Tech debt
**Estimativa:** 1h

**Contexto:**
`Sonner` já está montado em `app/layout.tsx:26-37`. Mas `components/ui/toast-provider.tsx` ainda existe e provavelmente é usado em alguns lugares.

**Auditoria:**
```bash
grep -rn "from \"@/components/ui/toast-provider\"\|useToast\|ToastProvider" apps/web --include="*.tsx"
```

**Migração:**
- Remover `<ToastProvider>` do layout se não usar mais.
- Substituir chamadas:
  - `useToast()` + `toast.show(...)` → `import { toast } from 'sonner'; toast(...)`.
  - Variantes: `toast.success`, `toast.error`, `toast.info`, `toast.promise(...)`.

**Aceite:**
- [ ] `toast-provider.tsx` removido (ou marcado deprecated)
- [ ] Todos os toasts usam Sonner
- [ ] Estilo consistente com o tema dark (já configurado em `layout.tsx:30-35`)

---

### TICKET #19 · Renomear commits

**Severidade:** 🟢 Cleanup
**Estimativa:** 15min

**Contexto:**
Commits problemáticos:
- `f7bc345` mensagem é o próprio comando git
- `1b7e60e` mensagem só "fix"
- `6095b85` poderia ser conventional

**Comandos:**
```bash
git fetch origin
git log --oneline --reverse 6095b85~1..HEAD
git rebase -i 6095b85~1
# Editor: trocar 'pick' por 'reword' apenas nos commits que serão renomeados.
# Atenção: o range pode incluir commits extras entre 6095b85 e HEAD; não reword commits fora do escopo.
# Salvar/fechar para cada commit aparecer e editar mensagem:
#   f7bc345 → fix(web): remove duplicate header from vault dashboard
#   1b7e60e → fix(web): proposals page minor fixes
#   6095b85 → feat(web): add session storage for vaults, clean legacy texts
git push --force-with-lease origin <branch>
```

⚠️ **Coordenar com colaboradores antes do force-push.**

**Aceite:**
- [ ] `git log --oneline --reverse 6095b85~1..HEAD` foi revisado antes do rebase
- [ ] `git log --oneline -8` mostra mensagens limpas conventional nos commits alvo
- [ ] `git push` com `--force-with-lease` aceito

---

## 4. Apêndice — Como pegar um ticket

1. Ler `MELHORIAS_DETALHADAS.md` para contexto estratégico.
2. Escolher ticket pela severidade (🔴 → 🟡 → 🟢).
3. Ler **Contexto** + **Arquivos** + **Estado atual**.
4. Implementar seguindo as **Convenções** (seção 0).
5. Validar contra **Aceite**.
6. Rodar antes de commitar:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm -F web build
   ```
7. Commit: `feat(web): <descrição>` ou `fix(web): <descrição>`.

## Apêndice — Comandos diagnósticos

```bash
# Slop signals
grep -rn "transition-all" apps/web --include="*.tsx"
grep -rn "bg-emerald\|bg-purple\|bg-blue\|bg-amber" apps/web --include="*.tsx"
grep -c "<svg" apps/web/app/vault/[multisig]/page.tsx

# Tamanho de arquivos
find apps/web/app -name "page.tsx" -exec wc -l {} + | sort -n

# Libs instaladas mas não usadas
for lib in cobe @number-flow/react vaul lenis cmdk; do
  echo "=== $lib ==="
  grep -rn "from \"$lib\"\|require(\"$lib\")" apps/web --include="*.tsx" --include="*.ts" | head -3
done

# fetchWithAuth: onde precisa de auth lazy
grep -rn "fetchWithAuth" apps/web --include="*.tsx" --include="*.ts"
```
