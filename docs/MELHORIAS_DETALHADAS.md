# Aegis — Plano de Melhorias (v2)

> Documento mestre. Aplica skills: brand-design, frontend-design-guidelines, design-taste, page-load-animations, number-formatting.

---

## 0. Diagnóstico atual

### Stack instalado (já presente, alguns subutilizados)

| Lib | Status | Oportunidade |
|---|---|---|
| `framer-motion` 11 | ✅ usado | Aplicar `stage >= N` pattern + ASCII storyboards |
| `sonner` | ✅ wired no layout | Substituir `toast-provider` artesanal (ainda existe) |
| `vaul` | ✅ instalado | **Não usado** — usar para bottom sheets mobile |
| `lenis` | ✅ provider existe | Montar `LenisProvider` na landing e respeitar reduced-motion |
| `@number-flow/react` | ⚠️ instalado | **Nunca importado** — usar em balances, contadores, drafts |
| `cobe` | ⚠️ instalado | **Nunca importado** — globe interativo no hero |
| `lucide-react` | ✅ usado | Substituir SVGs inline (~40 ocorrências) |
| `zustand` | ✅ instalado | Centralizar state de vaults/proposals |
| `react-query` | ✅ usado | Padronizar invalidação após mutations |
| `tailwindcss-animate` | ✅ instalado | Usar para shadcn primitives |

### Libs a adicionar

| Lib | Para quê |
|---|---|
| `cmdk` | Command palette (⌘K) — power users navegam vault |
| `@tanstack/react-table` | Tabelas de payroll, audit, proposals |
| `react-hook-form` | Forms (Send, Payroll, Settings) — substituir `useState` artesanal |
| `date-fns` | "2 hours ago" em audit/proposals |
| `next-themes` | Light/dark toggle (hoje é dark-only hardcoded) |
| `@vercel/og` | Open Graph dinâmico para audit links/invoices |
| `posthog-js` | Product analytics (opcional) |

### Sinais de AI-slop encontrados (design-taste)

- **`transition-all`** em 6 lugares — anti-pattern, anima propriedades imprevistas. Trocar por `transition-colors`, `transition-transform`, etc.
- **Cores competindo**: emerald, purple, blue, amber misturados com o accent gold. Direção institucional pede **single accent + grayscale**.
- **SVGs inline repetidos** em `vault/page.tsx` (~15 SVGs escritos à mão) — Lucide já é dependência.
- **Header redundante** dentro do dashboard duplicando o AppShell.
- **Backgrounds coloridos** (`bg-emerald-950/20`, `bg-amber-950/20`) — substituir por `bg-surface` ou `bg-accent-soft`.
- **`bg-emerald-500` em botões** (payroll) — usar `bg-accent` (token). Já existe a variável.

---

## 1. Direção de Design — Design Brief

```
Direction: Institutional Trust — dark workstation, warm-monochrome
Density:   Comfortable (not cramped, not airy SaaS)
Surface:   Cards on near-black bg, single border-strong line, subtle elevation
Type mood: Tight display (Fraunces), technical body (Inter), mono numerals
Motion:    Crisp springs, no bounce, entry > exit, reduced-motion respected
Accent:    Burnished Gold (#C9A86A) — used sparingly, never on backgrounds
Do:        Single accent, grayscale data, tabular-nums everywhere, dense tables,
           low-opacity shadows (4-8%), 1px borders, optical alignment
Don't:     Emerald/purple/blue mixed with gold, gradient backgrounds on cards,
           transition-all, hardcoded SVGs, multiple CTAs per surface,
           emoji-style status badges, transition: all
```

**Referência mental:** Linear + Stripe Atlas + Cash App Pro — institucional, denso, confiável.

---

## 2. Bugs Críticos (🔴 Alta)

### 1.1 Múltiplas proposals de inicialização

- **Causa:** `vault/[multisig]/page.tsx` cria bootstrap via `createInitCofreProposal` sem lock idempotente. `loadOnchainProposalSummaries()` hoje não expõe memo/tipo da vault transaction, então ainda não dá para detectar "init" on-chain com segurança.
- **Fix imediato:** lock em memória + `sessionStorage` antes de chamar `createInitCofreProposal`; botão disabled; guardar `pending-init-${multisig}` com `transactionIndex` após sucesso para impedir recriação acidental na mesma sessão.
- **Fix completo:** adicionar helper que lê a `VaultTransaction` memo/instructions e expõe `kind: "init_cofre"` em `ProposalSummary`; só então bloquear por proposta on-chain ativa/aprovada.
- **UX:** Mensagem clara + botão disabled + link "View pending proposal".
- **Debounce** de 1500ms no botão para evitar duplo-click.

### 1.2 Sincronização de status

- **Causa:** Sem invalidação de cache após approve/execute/reject. Listas não revalidam.
- **Fix:** Migrar para React Query com `queryKey: ['proposals', multisig]`. Após mutation, `queryClient.invalidateQueries(...)`.
- **OperatorInbox:** filtrar por `status === "approved" && hasDraft` para propostas prontas para execução. `active` ainda precisa de aprovações; `executed` já saiu da fila.
- **Badge:** derivado da query — soma reativa.

### 1.3 Cancelar/Excluir proposal

- **Cancel** (pending): `lib/squads-sdk.ts` ainda não expõe cancel. Verificar se a versão instalada de `@sqds/multisig` tem `multisig.instructions.proposalCancel`; se tiver, criar wrapper. Se não tiver, não prometer cancel on-chain e seguir apenas com archive off-chain.
- **Archive** (finalizada): soft-delete no draft local, on-chain permanece. Toggle "Show archived".

### 1.4 Shielded balance travado

- **Causa atual:** `page.tsx:409` mostra hardcoded `-- SOL`.
- **Fix:** integrar `cloak-sdk` `getShieldedBalance(cofre)`. Se SDK ainda não suporta, render explícito:
  ```tsx
  <Empty icon={Lock} title="Shielded balance unavailable"
         desc="Sync required after first deposit" />
  ```
- **Nunca** mostrar valor fake.

### 1.5 Wallet pedindo aprovação em read-only

- **Causa:** `useWalletAuth` não assina sozinho, mas algumas páginas chamam `fetchWithAuth` em `useEffect` para GETs públicos no mount (`audit`, `operator`, proposal detail). Isso abre o popup sem uma ação explícita do usuário.
- **Fix:**
  - Trocar `fetchWithAuth` por `fetch` em GETs sem `requireWalletAuth`: `/api/proposals/[multisig]`, `/api/payrolls/[multisig]`, `/api/audit-links/[vault]`.
  - Manter `fetchWithAuth` apenas em ações que precisam de assinatura: POST/claim/revoke/utxo/write.
  - Remover imports/deps de `useWalletAuth` em componentes que só leem dados públicos.

### 11. Erro Prisma (DATABASE_URL)

- **Causa:** schema e migrations versionadas dizem `postgresql`, mas env local está `file:./dev.db`.
- **Fix recomendado:** manter `provider = "postgresql"` e atualizar `.env.example`/`.env.local` para Postgres local. O repo já tem `migration_lock.toml` e migrations SQL de Postgres; voltar para SQLite exige reset consciente das migrations, não é um patch rápido.
- **Hardening:** `isPrismaAvailable()` validar que protocolo combina com provider:
  ```ts
  export function isPrismaAvailable() {
    const url = process.env.DATABASE_URL;
    if (!url) return false;
    return url.startsWith("postgresql://") || url.startsWith("postgres://");
  }
  ```

---

## 3. Decomposição do Dashboard

`apps/web/app/vault/[multisig]/page.tsx` (632 linhas) → quebrar em:

```
app/vault/[multisig]/
├── page.tsx                    (~80 linhas, só orquestração)
└── _dashboard/
    ├── CofreInitBanner.tsx
    ├── StatCards.tsx           (3 cards usando NumberFlow)
    ├── AddressesCard.tsx
    ├── RecentProposals.tsx
    ├── QuickActions.tsx        (novo)
    ├── ActivityFeed.tsx        (novo)
    └── hooks/
        ├── useCofreStatus.ts
        ├── useInitializeCofre.ts
        └── useDashboardData.ts
```

**Remover header interno** (linhas 321-349) — AppShell já cumpre.

---

## 4. Per-page Redesigns

### 4.1 Dashboard (Overview)

**Layout proposto (12-col grid, max-w-6xl):**

```
┌─ CofreInitBanner (full, condicional) ───────────┐
├─ StatCards [Available | Shielded | Pending] ────┤
├─ QuickActions [Send | Payroll | Audit | Inv] ───┤
├─ RecentProposals (col-8) ─┬─ ActivityFeed (col-4)
└──────────────────────────┴────────────────────┘
```

- **StatCards:** usar `<NumberFlow value={...} />` para animação de entrada e updates.
- **Sem badges coloridos** — status como pill cinza com label.
- **Spacing:** `gap-4` entre cards, `p-5` interno, `rounded-xl border border-border bg-surface`.

### 4.2 Operator

**Seções:**
1. **Operator Status header** — wallet + indicador (verde se autorizado, cinza se não).
2. **Inbox** — licenças prontas para executar, ordenadas por `createdAt desc`.
3. **History** — execuções passadas (paginado, `react-table`).
4. **Empty state:** "No licenses to execute. Approved proposals will appear here."

### 4.3 Payroll

- **Substituir** botão `bg-emerald-500` (linha 668) → `bg-accent`.
- **Tabela:** `@tanstack/react-table` com colunas Name | Wallet | Amount | Memo | Status.
- **CSV upload:** drop zone com `vaul` drawer mobile.
- **Summary card:** total, recipientes, batches recentes.

### 4.4 Proposal Detail

```
┌─ Header: type badge + #index + status pill ────┐
├─ Progress: signatures (3/5) com bolinhas ──────┤
├─ Details (memo, recipient, amount) ────────────┤
├─ Actions: Approve | Reject | Execute | Cancel ─┤
├─ Timeline (created → signed → executed) ───────┤
└─ <details>Technical (payload hash, etc.)</details>
```

### 4.5 Audit (revisão completa)

- Validar que captura: proposal_created, proposal_signed, proposal_executed, proposal_rejected, vault_initialized, operator_changed, payroll_*, audit_link_issued.
- **Lista virtualizada** (TanStack Virtual) se >100 eventos.
- Filtros: tipo, wallet, range de data.
- Export CSV via `audit:export`.

---

## 5. Animações (page-load-animations)

### 5.1 Storyboard padrão para qualquer página do vault

```tsx
// ┌─ MOUNT TIMELINE ────────────────────────────┐
// │ 0ms   header fade-in                         │
// │ 80ms  banner (se exists)                     │
// │ 160ms stat cards stagger (3 × 60ms)          │
// │ 380ms primary content                        │
// │ 460ms secondary panels stagger               │
// └──────────────────────────────────────────────┘
const TIMING = {
  HEADER: 0,
  BANNER: 80,
  STATS_START: 160, STATS_STAGGER: 60,
  PRIMARY: 380, SECONDARY: 460,
} as const;

const SPRING_ENTRANCE = { type: "spring", stiffness: 280, damping: 28 };
```

### 5.2 NumberFlow nos balances

```tsx
import NumberFlow from '@number-flow/react';
<NumberFlow value={balanceSol} format={{ maximumFractionDigits: 4 }} />
```

### 5.3 Lenis na landing (provider já existe, montar)

```tsx
// components/providers/LenisProvider.tsx
useEffect(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // iniciar Lenis existente e cancelar requestAnimationFrame no cleanup
}, []);
```

Montar `LenisProvider` em `app/page.tsx` apenas na landing para não interferir em telas operacionais.

### 5.4 Cobe globe no hero (substituir HeroDiagram opcional)

- Mostrar pontos pulsando representando "private executions globally".
- Já temos o `cobe` instalado.

---

## 6. Number Formatting (skill aplicado)

### Regras

- **Sempre** `font-mono tabular-nums`.
- **Zero-subscript** para tokens micro-cap: `0.0₄58` em vez de `0.00`.
- **Abreviação** (compact): `$1.2K`, `$3.4M`.
- **Nunca** `toFixed(2)` em token amounts — decimais dinâmicos via `tokenPriceUsd`.
- **Copy** retorna raw precision.

### Componente padrão

```tsx
<FormattedNumber value={amount} type="token_amount" context="compact" />
<FormattedNumber value={usd} type="fiat_value" context="detailed" />
```

Implementar em `lib/format-number.tsx` com helpers `formatTokenAmount`, `formatFiat`, `formatPercent`.

---

## 7. Mobile Strategy

### Breakpoints alvo

| Width | Device | Comportamento |
|---|---|---|
| 320 | iPhone SE | Sidebar oculta, bottom nav, drawer para vault list |
| 375-414 | iPhone | Stat cards stacked, tabela vira lista de cards |
| 768 | iPad | 2-col grid, sidebar opcional |
| 1024+ | Desktop | Full sidebar, 12-col grid |

### Padrões mobile

- **Modais → bottom sheets** (vaul). Já instalado.
- **Tabelas → cards** com label-value pares.
- **Hit targets ≥ 44×44** (iOS HIG).
- **Wallet button** em bottom-fixed bar quando desconectado.

---

## 8. Landing Page

### Validação de claims (vs. realidade da app)

| Claim | Realidade | Ação |
|---|---|---|
| "ZK Privacy" | Cloak commitments, não ZK puro | Trocar para "Shielded execution" |
| "End-to-end encrypted" | Parcial (sessionStorage + commitments) | Trocar para "Client-side secrets" |
| "Multi-sig security" | ✅ Squads v4 | Manter |
| "Auditable" | ✅ Audit links | Manter |
| Private Sends, Payroll, Invoices, Audit | ✅ todos devnet | Adicionar badge "Devnet" |

### Aprimoramentos

- **Hero:** integrar `cobe` globe ou manter `HeroDiagram` com micro-animação extra (license token brilhando ao passar pelos nodes).
- **Lenis** smooth scroll.
- **Section reveals** com `useInView` + spring (já temos `react-intersection-observer`).
- **Trust bar:** logos de tecnologias (Solana, Squads, Cloak) em vez de só ícones genéricos.
- **Social proof section:** GitHub stars, devnet stats, "X transactions executed privately".
- **Tipo "Aegis":** corrigir todos os textos corridos. No `Logo.tsx`, manter `aegis` lowercase é decisão tipográfica intencional — manter.

---

## 9. Settings (nova página)

**Rota:** `apps/web/app/vault/[multisig]/settings/page.tsx`

**Tabs:**
- **General** — nome do vault (localStorage), idioma (i18n futuro).
- **Members** — lista de signatários do Squads (read-only do on-chain).
- **Operator** — wallet registrada, change operator (proposal).
- **Notifications** — opt-in browser notifications, threshold.
- **Appearance** — light/dark via `next-themes`, density (comfortable/compact).
- **Danger Zone** — remove vault from local list, clear sessionStorage cache.

---

## 10. Header do Vault — Vault Switcher

Substituir o `Address` mostrado no AppShell (`AppShell.tsx:105`) por um Popover com:

```
[ Æ Vault Name • abc...xyz ▾ ]
   ┌──────────────────────────┐
   │ ◉ Current vault          │
   │   abc...xyz   [copy]     │
   ├──────────────────────────┤
   │ Other vaults             │
   │ ○ Vault 2  def...uvw     │
   │ ○ Vault 3  ghi...rst     │
   ├──────────────────────────┤
   │ + Add vault              │
   │ - Remove current         │
   └──────────────────────────┘
```

Persistência via `zustand` + `persist` middleware em localStorage.

---

## 11. Acessibilidade (checklist)

- [ ] Todos `<button>`/`<a>` reais, zero `<div onClick>`.
- [ ] Focus rings visíveis (já existe em `globals.css:81-85`).
- [ ] Labels em forms.
- [ ] `aria-label` em ícones-só.
- [ ] Hit targets ≥ 44×44 mobile.
- [ ] Contraste AA: verificar `text-ink-subtle` (#71717A) sobre `bg-bg` (#0A0B0D) — provável OK, mas validar.
- [ ] `prefers-reduced-motion` em todas as animações.
- [ ] Keyboard: Tab, Enter, Esc fechando overlays, ⌘K para command palette.

---

## 12. Performance

- **Decompor** `vault/page.tsx` reduz bundle inicial.
- **`next/dynamic`** para Cobe (heavy, client-only).
- **Image:** `next/image` em qualquer imagem (hoje há placeholder).
- **Font:** já usa `next/font` (bom).
- **React Query staleTime:** ajustar por endpoint (drafts: 5s, audit: 30s).
- **Polling** atual de 5s em dashboard + inbox + operator = 3 requests/5s. Consolidar em uma query única.

---

## 13. Git — Renomear Commits

```bash
git log --oneline --reverse 6095b85~1..HEAD
git rebase -i 6095b85~1
# substituir 'pick' por 'reword' apenas nos commits alvo e ajustar mensagens:
# f7bc345 → fix(web): remove duplicate header from vault dashboard
# 1b7e60e → fix(web): proposals page minor fixes
# 6095b85 → feat(web): add vault session storage, clean up legacy texts
git push --force-with-lease
```

⚠️ O range pode conter commits extras entre `6095b85` e `HEAD`; revisar o `git log` antes e coordenar com colaboradores antes do force-push.

---

## 14. Sprint Plan

### Sprint 1 (esta semana) — Bloqueadores

- [ ] **Dia 1:** Corrigir Prisma DATABASE_URL + `isPrismaAvailable` hardening.
- [ ] **Dia 1-2:** Bug 1.1 (múltiplas init proposals) + 1.5 (wallet auth read-only).
- [ ] **Dia 2-3:** Bug 1.2 (sync proposals) com React Query invalidation.
- [ ] **Dia 3:** Bug 1.4 (shielded balance) — investigar SDK ou empty state.
- [ ] **Dia 4:** Renomear commits + cleanup `transition-all`.

### Sprint 2 — Design system

- [ ] Criar `brand.md` documentando Heraldic Dark (já implementado em CSS).
- [ ] Build `<FormattedNumber>` component.
- [ ] Migrar SVGs inline → Lucide.
- [ ] Substituir cores soltas (emerald/purple/blue) por accent + grayscale.
- [ ] Ativar Lenis na landing.

### Sprint 3 — Redesigns

- [ ] Decompor dashboard (5 sub-componentes + 3 hooks).
- [ ] Redesign Operator + Payroll + Proposal Detail.
- [ ] NumberFlow nos balances.
- [ ] Mobile pass (bottom sheets, tabelas → cards).

### Sprint 4 — Novas features

- [ ] Audit revisão completa.
- [ ] Settings page.
- [ ] Vault switcher no header.
- [ ] Cancel/Archive proposals.
- [ ] Command palette (`cmdk`).

### Sprint 5 — Polish

- [ ] Anti-slop sweep final (design-taste review).
- [ ] Landing animations finais (cobe ou hero diagram melhorado).
- [ ] Performance audit.
- [ ] A11y final pass.

---

## 15. Estrutura final esperada

```
apps/web/
├── app/
│   ├── page.tsx                          (landing, com lenis)
│   └── vault/[multisig]/
│       ├── page.tsx                      (~80 lines, orquestrador)
│       ├── _dashboard/                   (sub-componentes)
│       ├── settings/                     (nova)
│       └── [outras já existentes]
├── components/
│   ├── ui/
│   │   ├── formatted-number.tsx          (novo)
│   │   ├── stat-card.tsx                 (novo)
│   │   ├── empty-state.tsx               (novo, padronizado)
│   │   ├── timeline.tsx                  (novo, p/ proposal detail)
│   │   └── command-palette.tsx           (novo, cmdk)
│   └── app/
│       └── VaultSwitcher.tsx             (novo, substitui Address no header)
├── lib/
│   ├── format-number.ts                  (novo)
│   ├── stores/
│   │   └── vault-store.ts                (zustand persist)
│   └── prisma.ts                         (hardening)
└── brand.md                              (novo, gerado por brand-design)
```

---

## Apêndice A — Checklist anti-slop final

Antes de marcar qualquer página como concluída, verificar:

- [ ] Apenas 1 cor accent + escala de cinza (sem emerald/purple/blue/amber soltos)
- [ ] Sem `transition-all`
- [ ] Sem SVG inline (tudo via Lucide)
- [ ] Tabular-nums em todo número
- [ ] Empty state com ação clara
- [ ] Loading com skeleton, não só spinner
- [ ] Error state com retry
- [ ] Focus ring visível
- [ ] Hit target ≥ 44×44 mobile
- [ ] Reduced-motion respeitado
- [ ] Funciona em 320px de largura
- [ ] Sem `bg-{color}-{shade}/0.X` — usar tokens

---

## Apêndice B — Comandos úteis

```bash
# Achar AI-slop signals
grep -rn "transition-all\|transition: all" apps/web --include="*.tsx"
grep -rn "bg-emerald\|bg-purple\|bg-blue\|bg-amber" apps/web --include="*.tsx"
grep -rn "<svg" apps/web/app --include="*.tsx" | wc -l

# Validar contraste / a11y (instalar eslint-plugin-jsx-a11y)
pnpm -F web add -D eslint-plugin-jsx-a11y

# Após decomposição, conferir tamanho
wc -l apps/web/app/vault/[multisig]/page.tsx  # alvo: <100
```

---

## Apêndice C — Por que isso importa

Aegis está vendendo **confiança institucional**. Tesourarias multimilhões não vão entregar custódia para uma UI que parece um template de SaaS genérico. Cada detalhe que parece AI-gerado (`bg-purple-500/10`, `transition-all`, gradiente em hero, SVGs amontoados) é uma micro-perda de confiança.

A diferença entre "devnet prototype" e "produto sério no qual times pagam" é exatamente este nível de detalhe. Esse documento mapeia tudo que precisa virar para sair dessa percepção.
