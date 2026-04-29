# Aegis — Redesign Plan

> Living document. Atualizado a cada etapa concluída. Nome anterior: `Cloak Squads`.

---

## Contexto

Produto: camada de execução privada sobre Squads v4 multisigs em Solana, usando o protocolo Cloak. Antes chamado `Cloak Squads`, o nome confundia o produto com o protocolo subjacente (`@cloak.dev/sdk-devnet`) e parecia plugin do Squads. **Renomeado para `Aegis`** — escudo mitológico, tom institucional, foco em tesourarias e times que precisam de privacidade auditável.

### Stack que permanece
- On-chain: Anchor `cloak-gatekeeper`, Squads v4 SDK, Cloak devnet SDK.
- Web: Next.js 15 (App Router), Tailwind, shadcn-style primitives, framer-motion, Solana Wallet Adapter.
- Persistência: Prisma + SQLite.
- Features mantidas: Private Send, Payroll, Audit Admin, Public Audit Link, Stealth Invoice, Operator flow.

### Dores identificadas
1. **Identidade visual genérica** — landing em template "crypto SaaS" emerald/teal, sem logo, sem wordmark, sem voice.
2. **Operator step manual em todo final de feature** — usuário cria proposta → aprova → executa vault tx → e ainda precisa abrir `/cofre/<m>/operator`, carregar proposta, executar licença. Quebra o fluxo.
3. **Dashboard monolítico** — `app/cofre/[multisig]/page.tsx` com 27kb num arquivo só.
4. **Landing genérica** — não comunica diferencial vs. "outro multisig" ou "outro privacy coin".
5. **Sem narrativa de marca** — nenhum manifesto, nenhum tom, nenhuma diferenciação visual entre seções.

---

## Escopo do redesign (clarificado)

O redesign cobre **TODA a superfície visual** do web app: landing, shell global, dashboard do cofre, e **todas as telas de feature** (Send, Payroll, Audit, Invoice, Operator, Proposals, Claim público, Audit público).

**Entra (visual / UX):**
- Toda a árvore `apps/web/app/**/*.tsx` e `apps/web/components/**/*.tsx`.
- Landing.
- Header / navbar global e do cofre.
- Footer global.
- Layout/dashboard do `/cofre/[multisig]/*`.
- **Modals centralizados** (todos — confirm, create multisig, audit-link, claim, etc.).
- **Loading states** (todos — skeletons, spinners, shimmer, page transitions).
- **Error states** (todos — error boundaries, form errors, API errors, empty states).
- **Toast system** (substituir provider artesanal por sonner).
- **Bottom sheets / drawers** (vaul).
- **Telas de feature** — formulários, cards, listas, widgets, gráficos, badges. Densidade visual nova, mas mesmas props, mesmos campos, mesmos botões funcionais.
- Tipografia, paleta, ícones (Lucide), iconografia toda.
- Smooth scroll, micro-interações, animações de transição.

**NÃO entra (lógica/funcional):**
- Lógica de negócio dentro dos handlers `onClick`, `onSubmit`, dos hooks `useQuery`/`useMutation`, dos efeitos.
- API routes em `apps/web/app/api/**`.
- Schemas Prisma, migrations.
- `apps/web/lib/**` (helpers Solana/Squads/Cloak/audit/etc).
- Programas Anchor (`programs/`), pacote core (`packages/core`), testes (`tests/`).
- O fluxo do operador (issuance/consumo de licença) — **somente o visual** das telas de operador muda. A correção arquitetural ("operator inline em cada feature") fica para depois.

> Regra de ouro para o executor: **se a mudança altera o que a função faz, parou. Se altera só como aparece, segue.**

## Roadmap (etapas)

- [x] **Etapa 1 — Nome.** Decidido: **Aegis**.
- [x] **Etapa 2 — Identidade visual.** Tom institucional, paleta heraldic dark, tipografia Fraunces/Inter/Geist Mono, accent ouro brunido, princípios de design. Benchmarks: Cloak.ag, Linear, Mercury, Stripe.
- [x] **Etapa 3 — Foundation técnica.** Libs instaladas, tokens Tailwind, CSS vars, fonts, primitivos `Logo`/`Eyebrow`/`Mono`/`Stat`/`Address`/`TtlPill`/`StatusBadge`/`Divider`, LenisProvider. Primitivos legados refatorados (`button`, `input`, `card`, `dialog` real com portal/ESC, `sheet` com vaul, `skeleton`, `confirm-modal`). Toast-provider delega pro sonner. Layout.tsx com fontes, metadata Aegis, Toaster.
- [x] **Etapa 4 — Shell global.** `SiteHeader` (sticky, blur, nav, wallet CTA), `SiteFooter` (4 colunas, trust bar), `AppShell` (side nav desktop, top bar, mobile drawer), `OperatorInboxSheet` (vaul, badge count).
- [x] **Etapa 5 — Landing nova.** `app/page.tsx` reescrita: hero com headline Fraunces, diagrama animado Squads→Gatekeeper→Operator, input de vault, trust bar, 3 steps, 6 use-case cards, seção Security, FAQ accordion, CTA final. Animações Framer Motion sutis.
- [x] **Etapa 6 — Dashboard shell.** `app/cofre/[multisig]/layout.tsx` envolve `AppShell` com side nav (Overview, Send, Payroll, Audit, Invoices, Proposals, Operator, Settings), top bar com breadcrumb do vault, botão Inbox e wallet.
- [x] **Etapa 7 — Telas de feature (visual).** Script de migração de cores aplicado em massa a `cofre/[multisig]/*`, `claim/[stealthId]`, `audit/[linkId]`, `create-multisig`, `proposal/*`, `proof/*`, `wallet/*`. Todas as classes `neutral-*`, `emerald-*`, `red-*`, `blue-*`, `amber-*` migradas para tokens Aegis. `error-boundary` e `toast` legado também atualizados.
- [ ] **Etapa 8 — Operator flow fix (funcional).** Operator inline em cada feature. **Fora do escopo desta rodada**.
- [ ] **Etapa 9 — Polish.** Mobile, a11y, micro-interações finais.
- [x] **Etapa 10 — Migração de naming (parcial).** Metadata `Aegis`, wallet adapter CSS override com tokens Aegis. Strings visuais de "Cloak Squads" → "Aegis" restantes nos arquivos de feature (serão atualizadas manualmente na Etapa 9).

> **Build status**: `pnpm -F web typecheck` passa. `pnpm -F web build` passa. Todas as rotas prerenderizam com sucesso.

---

## Etapa 1 — Nome

**Decisão:** `Aegis`

**Por quê:**
- Substantivo curto, mitológico (escudo de Zeus/Atena) → conota proteção institucional.
- Não é nome reservado em Solana (verificar domínio depois).
- Tom certo para tesourarias DAO, fundos, times sérios — diferente do tom "consumer crypto".
- Funciona como verbo informal: "*put it under aegis*".

**Tagline candidata:** *Private execution for shared treasuries.*

**Aliases internos:**
- Produto: `Aegis`
- Conceito-vault: `cofre` (mantido como termo de domínio na URL — `/cofre/<multisig>`).
- Repositório/package: TBD (Etapa 8).

---

## Etapa 2 — Identidade visual

### Tom de marca
**Institucional / private banking on-chain.** Sério, denso, refinado. Não é "consumer crypto", não é "cypherpunk". É a sensação de abrir uma conta numa private bank suíça que por acaso roda em Solana. Referências: Linear, Mercury, Stripe, Arc, Cloak.ag (benchmark direto, sister product).

### Voz
Curta, declarativa, técnica sem jargão crypto. Verbos de marca: **settle, attest, seal, scope, license, custody, shield**.

| ❌ | ✅ |
|---|---|
| "Send private transactions on Solana 🚀" | "Settle privately. Attest publicly." |
| "Connect your wallet to get started" | "Connect a wallet to access your treasury." |
| "Awesome! Your proposal was created" | "Proposal sealed. Awaiting threshold." |
| "Your tx is pending..." | "License issued. TTL 4m 12s." |

### Paleta — *Heraldic Dark*

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#0A0B0D` | fundo (near-black levemente quente) |
| `surface` | `#131519` | cards, panels |
| `surface-2` | `#1B1E24` | hover, elevated |
| `border` | `#262932` | divisores |
| `border-strong` | `#3A3F4A` | bordas ativas / focus subtle |
| `text` | `#F4F4F5` | primário |
| `text-muted` | `#A1A1AA` | secundário |
| `text-subtle` | `#71717A` | terciário, placeholders |
| `accent` | `#C9A86A` | **ouro brunido** — único destaque, escasso |
| `accent-hover` | `#D9B97A` | |
| `accent-soft` | `#3A2F1A` | badges/glow |
| `signal-positive` | `#7FB069` | license consumed, success crítico |
| `signal-warn` | `#D4A24C` | TTL próximo do fim |
| `signal-danger` | `#C45A5A` | revogado, expirado |

### Tipografia

| Papel | Fonte | Notas |
|---|---|---|
| Display | **Fraunces** (Google Fonts, variável) | Serif moderna com axes ópticos. Hero, manifesto, números grandes. Tracking apertado, peso 600–700. |
| Body / UI | **Inter** | Já no projeto. Neutro, institucional. |
| Mono | **Geist Mono** | Hashes, addresses, amounts, TTL. Auditabilidade visual. |

Diferenciação vs. Cloak: Cloak usa Manrope + Darker Grotesque (sans-only, tech). Aegis usa **serif display** (Fraunces) → puxa o tom pra "treasury / institucional" enquanto Cloak fica em "infra / SDK".

### Logo / wordmark

**Direção primária:** monograma `Æ` em Fraunces bold + wordmark `aegis` lowercase letterspaced.
- `Æ` é literalmente as duas primeiras letras da palavra — ligadura latina, heráldica, distintiva.
- Funciona como favicon, app icon, watermark em audit links.
- Versão completa horizontal: `Æ aegis`.
- Em uma cor: ouro brunido sobre `bg`, ou `text` sobre fundo claro.

**Versão secundária:** wordmark `aegis` sozinho em Fraunces bold com tracking -2%.

### Princípios de design (5)

1. **Quiet by default.** Hierarquia tipográfica antes de cor. Interface não compete com conteúdo.
2. **Heraldic accent.** Ouro brunido `#C9A86A` é uma reserva — primary buttons, focus rings, ações de marca. Nunca em decoração.
3. **Auditável é bonito.** Hashes, endereços e valores em mono fixed, alinhados, sempre copiáveis. Nada é "embelezado escondendo dado".
4. **Tempo é status.** TTLs, threshold pending, expiração — cidadãos de primeira classe, não notas de rodapé.
5. **Diagramas funcionais > orbs decorativos.** Animações no produto **explicam** o protocolo (Squads → Gatekeeper → Operator) — não enchem espaço.

### Stack visual (libs)

| Lib | Por quê |
|---|---|
| `framer-motion` | já no projeto. Animação primária. |
| `@studio-freight/lenis` | smooth scroll premium (Linear, Arc, Cloak-tier). |
| `sonner` | toasts limpos. Substitui o `components/ui/toast-provider.tsx` atual. |
| `vaul` | bottom sheets / drawers — mobile + Operator Inbox. |
| `lucide-react` | iconografia consistente. Substitui SVGs inline. |
| `@number-flow/react` | tickers animados (live shielded total, etc). |
| `cobe` | globo WebGL leve no rodapé/CTA. |
| `react-intersection-observer` | scroll-triggered animations. |
| `next/font` | self-host Fraunces + Inter + Geist Mono. |
| (mantém) `@radix-ui/*` via shadcn, `cva`, `tailwind-merge`. |

### Diferenciação visual de Cloak

| | Cloak | Aegis |
|---|---|---|
| Categoria | Privacy infra (B2B SDK) | Treasury app (B2B end-product) |
| Display type | Sans grotesk (Darker Grotesque) | **Fraunces** (serif moderna) |
| Accent | Roxo `#7C5CFF` | **Ouro brunido `#C9A86A`** |
| Hero metaphor | UTXOs voando, live tx feed | **License sealed** viajando Squads → Gatekeeper → Operator |
| Voz | "Just math." | "Settle privately. Attest publicly." |


---

# Handoff para o executor

Esta seção é o briefing técnico para outro modelo / dev pegar e tocar o redesign. Tudo abaixo é **estado real do repositório** após as etapas 1, 2 e 3-parcial.

## 1 — Estado atual do código

### Já feito
| Arquivo | Status |
|---|---|
| `docs/REDESIGN.md` | Este documento. Único source of truth. |
| `apps/web/package.json` | Libs instaladas: `lenis`, `sonner`, `vaul`, `lucide-react`, `@number-flow/react`, `cobe`, `react-intersection-observer`, `tailwindcss-animate`, `clsx`. **Pré-existentes**: `framer-motion`, `class-variance-authority`, `clsx`, `zustand`, `@tanstack/react-query`, `@solana/*`, `@sqds/multisig`, `@cloak.dev/sdk-devnet`. |
| `apps/web/tailwind.config.ts` | **Reescrito** com tokens Aegis: `bg`, `surface{,-2,-3}`, `border{,-strong}`, `ink{,-muted,-subtle}`, `accent{,-hover,-soft,-ink}`, `signal-{positive,warn,danger}`. Aliases shadcn (`background`, `foreground`, `muted`, `primary`). Font families `display`/`sans`/`mono`. Display sizes (`display-sm`, `display`, `display-lg`). Eyebrow tracking. Shadows (`raise-1`, `raise-2`, `accent-glow`). Keyframes/animations (`fade-in`, `marquee`, `shimmer`). Plugin `tailwindcss-animate`. |
| `apps/web/app/globals.css` | **Reescrito** com CSS vars HSL para todos os tokens, body/html base, scrollbar dark, focus ring accent, classes `.grid-bg`, `.text-eyebrow`, `.num`, e setup Lenis. |
| `apps/web/app/fonts.ts` | **Novo**. Exporta `fontDisplay` (Fraunces), `fontSans` (Inter), `fontMono` (Geist Mono) via `next/font/google`. |
| `apps/web/components/providers/LenisProvider.tsx` | **Novo**. Smooth scroll global. |
| `apps/web/components/brand/Logo.tsx` | **Novo**. `<Logo variant="full|monogram|wordmark" size="sm|md|lg" href="/">`. Æ em `text-accent` + `aegis` lowercase em `text-ink`, fonte display. |
| `apps/web/components/ui/aegis.tsx` | **Novo**. Primitivos: `Eyebrow`, `Mono`, `Stat`, `Address` (copiável), `TtlPill`, `StatusBadge` (sealed/pending/approved/executed/expired/revoked/draft), `Divider`. |

### NÃO feito ainda (caminhos críticos pro executor pegar)
| Arquivo | O que precisa |
|---|---|
| `apps/web/app/layout.tsx` | Importar `fontDisplay/fontSans/fontMono` de `./fonts`, aplicar `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable} font-sans` no `<body>`. Trocar `metadata.title` para `Aegis` e description para `Private execution for shared treasuries on Solana.`. Envolver com `<LenisProvider>` (depois de `<WalletProviders>` está bom). Adicionar `<Toaster />` do sonner (`import { Toaster } from "sonner"` — props: `theme="dark"`, `position="bottom-right"`, `toastOptions={{ classNames: { toast: "border border-border bg-surface text-ink", description: "text-ink-muted", actionButton: "bg-accent text-accent-ink", cancelButton: "bg-surface-2 text-ink-muted" } }}`). Manter `<ToastProvider>` apenas se ainda houver call sites — ver item abaixo. |
| `apps/web/components/ui/toast-provider.tsx` | Reescrever para delegar ao sonner: manter `useToast()` com a mesma assinatura (`addToast(message, type, duration?)`). Implementação interna: `import { toast } from "sonner"` e dentro de `addToast` chamar `toast[type](message, { duration })`. Remover o estado interno e o renderizador de `ToastItem`. **Não quebrar a API** — há ~12 call sites usando `addToast`. |
| `apps/web/components/ui/button.tsx` | Trocar todos os `bg-emerald-*`, `text-emerald-*`, `bg-neutral-*`, `text-neutral-*` por tokens Aegis (ver tabela de migração abaixo). Variantes finais: `default` (accent solid), `secondary` (surface-2), `outline` (border + transparent), `ghost`, `destructive` (signal-danger), `link`. Remover `gradient`. Adicionar variante `accent-soft` (fundo `bg-accent-soft`, texto `text-accent`). |
| `apps/web/components/ui/input.tsx` | Tokens: `bg-surface`, `border-border`, `text-ink`, `placeholder:text-ink-subtle`, `focus-visible:border-accent focus-visible:ring-accent/30`, `hover:border-border-strong`. Mesma coisa pra `Textarea`. |
| `apps/web/components/ui/card.tsx` | `bg-surface`, `border-border`. `CardHeader` `border-b border-border`. `CardTitle` `text-ink font-display font-semibold`. `CardDescription` `text-ink-muted`. |
| `apps/web/components/ui/dialog.tsx` | **Reescrever inteiro.** Modal centralizado real com Framer Motion + portal + ESC + click-outside + focus trap básico. API: `<Dialog open onOpenChange>`, `<DialogContent size="sm|md|lg|xl">`, `<DialogHeader>`, `<DialogTitle>` (font-display), `<DialogDescription>`, `<DialogFooter>`. Backdrop `bg-bg/80 backdrop-blur-md`. Content `bg-surface border border-border rounded-xl shadow-raise-2`. Animação: backdrop fade, content scale+fade. |
| `apps/web/components/ui/sheet.tsx` | **Substituir por vaul.** API: `<Sheet open onOpenChange side="right|bottom">`, `<SheetContent>`, etc. Em desktop, `side="right"` vira slide-over de 480px. Em mobile (< md), forçar `side="bottom"` (drawer Vaul nativo). |
| `apps/web/components/ui/skeleton.tsx` | `bg-surface-2` (não `bg-neutral-800`). `Spinner` em `text-accent`. `SkeletonCard` e `SkeletonDashboard` reescritos com `border-border bg-surface`. |
| `apps/web/components/ui/confirm-modal.tsx` | Ler arquivo, redesenhar usando o novo `Dialog`. Manter API. |
| `apps/web/components/ui/animations.tsx` | Manter exports `StaggerContainer`/`StaggerItem`. Apenas confirmar que cores internas não usam emerald. |
| `apps/web/components/proof/ProofGenerationState.tsx` | Refatorar visual mantendo lógica/props. `text-emerald-*` → `text-signal-positive`. Spinner accent. |
| `apps/web/components/proposal/CommitmentCheck.tsx` | Idem. |
| `apps/web/components/proposal/ApprovalButtons.tsx` | Idem. Botões em variantes Aegis. |
| `apps/web/components/proposal/ExecuteButton.tsx` | Idem. |
| `apps/web/components/wallet/ClientWalletButton.tsx` | Avaliar: `WalletMultiButton` do `@solana/wallet-adapter-react-ui` traz CSS próprio. Sobrescrever via CSS targeting `.wallet-adapter-button` no `globals.css` para usar tokens Aegis. Ou criar um `WalletButton` Aegis-native (recomendado) usando `useWallet`+`useWalletModal`. |
| `apps/web/components/wallet/WalletProviders.tsx` | Não tocar (lógica). |
| `apps/web/components/create-multisig/CreateMultisigCard.tsx` | Refactor visual completo, manter lógica de criação de multisig intacta. É um arquivo grande (19kb) — fazer em passes. |

### Telas de feature (Etapa 7 — só visual)
| Rota / arquivo | Notas |
|---|---|
| `apps/web/app/page.tsx` | **Reescrever** (Etapa 5, landing). Manter `useRedirectParam`, `onOpenMultisig`, integração `<CreateMultisigCard />`. |
| `apps/web/app/cofre/[multisig]/page.tsx` | Reescrever (Etapa 6, dashboard shell). Quebrar em sub-componentes. Manter todos os hooks/queries. |
| `apps/web/app/cofre/[multisig]/send/page.tsx` | Refactor visual. |
| `apps/web/app/cofre/[multisig]/payroll/page.tsx` | Refactor visual (CSV upload, tabela de recipients, totals). |
| `apps/web/app/cofre/[multisig]/audit/page.tsx` | Refactor visual (audit link generator + lista). |
| `apps/web/app/cofre/[multisig]/invoice/page.tsx` | Refactor visual (invoice creator). |
| `apps/web/app/cofre/[multisig]/operator/page.tsx` | Refactor visual (license consumer). |
| `apps/web/app/cofre/[multisig]/proposals/[id]/page.tsx` | Refactor visual (detalhe da proposta — 20 matches emerald). |
| `apps/web/app/audit/[linkId]/page.tsx` | Audit público — refactor visual (página exposta sem wallet). |
| `apps/web/app/claim/[stealthId]/page.tsx` | Claim público — refactor visual. |

## 2 — Tabela de migração de cores

Substituições mecânicas. Aplicar globalmente em todo `apps/web/app/**/*.tsx` e `apps/web/components/**/*.tsx`.

| ❌ Legado (Tailwind stock) | ✅ Aegis token |
|---|---|
| `bg-neutral-950` | `bg-bg` |
| `bg-neutral-900` | `bg-surface` |
| `bg-neutral-900/60`, `bg-neutral-900/80` | `bg-surface/60`, `bg-surface/80` |
| `bg-neutral-800` | `bg-surface-2` |
| `bg-neutral-800/50`, `bg-neutral-800/80` | `bg-surface-2/50`, `bg-surface-2/80` |
| `border-neutral-800`, `border-neutral-800/50` | `border-border`, `border-border/50` |
| `border-neutral-700` | `border-border-strong` |
| `text-neutral-50` | `text-ink` |
| `text-neutral-100` | `text-ink` |
| `text-neutral-200`, `text-neutral-300` | `text-ink` (ou `text-ink-muted` se for descritivo) |
| `text-neutral-400` | `text-ink-muted` |
| `text-neutral-500`, `text-neutral-600` | `text-ink-subtle` |
| `bg-emerald-500`, `bg-emerald-400` | `bg-accent` (hover: `bg-accent-hover`) |
| `text-emerald-300`, `text-emerald-400` | `text-accent` |
| `text-emerald-500/60` | `text-accent/60` |
| `bg-emerald-500/10`, `bg-emerald-500/20` | `bg-accent-soft` (já é `#3A2F1A`, não precisa de alpha) |
| `bg-emerald-950/30`, `bg-emerald-950/50` | `bg-accent-soft/40` |
| `border-emerald-800/50`, `border-emerald-500/30` | `border-accent/30` |
| `from-emerald-400 to-teal-400` (gradients) | sem gradient. Usar `bg-accent`. Em casos especiais: `bg-gradient-to-r from-accent to-accent-hover`. |
| `text-red-400`, `bg-red-500`, `border-red-800` | `text-signal-danger`, `bg-signal-danger`, `border-signal-danger/30` |
| `text-amber-400`, `bg-amber-950/90` | `text-signal-warn`, `bg-signal-warn/10` |
| `text-blue-400`, `bg-blue-950/90` | `text-ink-muted`, `bg-surface-2` (info → neutro) |

> Recomendação: rodar uma **busca grep + revisão manual** arquivo por arquivo, não um sed cego. Algumas substituições precisam de ajuste (ex: gradients viram cor sólida, alguns alphas precisam recalibrar).

## 3 — Mapeamento de elementos visuais

### Botões (variantes finais)
- **`default`** (`variant="default"`): `bg-accent text-accent-ink hover:bg-accent-hover` — ação primária da tela. Usar 1x por tela no máximo.
- **`secondary`**: `bg-surface-2 text-ink hover:bg-surface-3 border border-border`.
- **`outline`**: `border border-border-strong text-ink hover:bg-surface-2 bg-transparent`.
- **`ghost`**: `text-ink-muted hover:text-ink hover:bg-surface-2`.
- **`destructive`**: `bg-signal-danger/15 text-signal-danger border border-signal-danger/30 hover:bg-signal-danger/25`.
- **`accent-soft`** (nova): `bg-accent-soft text-accent border border-accent/20 hover:border-accent/40`.

### Tipografia
- **Hero / display**: `font-display text-display-lg font-semibold tracking-tight`.
- **H1 de página**: `font-display text-4xl font-semibold`.
- **H2 de seção**: `font-display text-2xl font-semibold`.
- **H3 / card title**: `font-sans text-base font-semibold text-ink`.
- **Eyebrow**: `text-eyebrow` (mono uppercase letterspaced).
- **Body**: `text-sm text-ink-muted leading-relaxed` (ou `text-base` se for landing).
- **Mono / dado on-chain**: usar `<Mono>` de `components/ui/aegis.tsx`.

### Cards
- Default: `rounded-lg border border-border bg-surface`.
- Hover interativo: adicionar `transition-colors hover:border-border-strong hover:bg-surface-2`.
- Header: `border-b border-border p-4` ou `p-5`.
- Padding interno padrão: `p-5` (cards grandes), `p-4` (cards densos), `p-3` (list items).

### Modals (Dialog)
- Centralizados sempre (não cantos).
- Backdrop: `bg-bg/80 backdrop-blur-md`.
- Content: `bg-surface border border-border rounded-xl shadow-raise-2`.
- Tamanhos: `sm` (max-w-sm), `md` (max-w-md, default), `lg` (max-w-lg), `xl` (max-w-2xl).
- Header sempre tem: title (font-display), description opcional (text-ink-muted), botão close (X) no canto superior direito.
- Footer: ações alinhadas à direita, primária à direita, cancel à esquerda dela.
- Animação: backdrop `opacity 0→1`, content `opacity+scale 0.96→1`. Duration 0.2s ease-out.

### Sheets / Drawers
- Desktop: slide-over da direita, `w-full max-w-[480px]`.
- Mobile (< md): bottom drawer (Vaul) com handle.
- Backdrop igual ao Dialog.
- Header sticky no topo, footer sticky no rodapé.

### Loading states
- **Skeleton**: `bg-surface-2 animate-pulse rounded-md`. Manter `count` prop.
- **Page-level loading**: full skeleton mimicando o layout final (dashboard skeleton já existe — refazer com tokens).
- **Inline button loading**: spinner accent à esquerda do texto.
- **Form submit**: botão primário vira disabled + spinner, restante do form fica `opacity-60 pointer-events-none`.
- **Long-running (proof generation, license consumption)**: usar `ProofGenerationState` com 3 steps animados, accent glow no step ativo.

### Error states
- **Form field error**: `text-signal-danger text-xs mt-1`. Border do input `border-signal-danger`.
- **Banner de erro de API**: card `bg-signal-danger/10 border border-signal-danger/30 text-signal-danger` com ícone Lucide `AlertCircle` à esquerda.
- **Empty state**: card centralizado com ícone Lucide grande `text-ink-subtle`, title `text-ink`, descrição `text-ink-muted`, CTA primário se houver ação.
- **Page error (errorBoundary)**: full page com Æ pequeno, "Something went wrong.", descrição, botão `Reload` outline + `Go home` accent-soft.
- **404**: full page com Æ grande, "404 — Off the ledger.", botão "Return to vault" → `/`.

### Toasts (sonner)
- **Success**: usar `toast.success(message)`. Ícone `Check` accent-soft.
- **Error**: `toast.error(message)`. Ícone `AlertCircle` em signal-danger.
- **Warning**: `toast.warning(message)`. Ícone `AlertTriangle` signal-warn.
- **Info / default**: `toast(message)`. Sem ícone.
- Position: `bottom-right` desktop, `top-center` mobile.
- Theme: `dark`. Container: `bg-surface border-border text-ink`.

### Iconografia
- **Lucide-react para tudo.** Tamanho default `h-4 w-4` em botões/inline, `h-5 w-5` em headers de card, `h-6 w-6` em hero icons, `h-12 w-12+` em empty states.
- Stroke width `1.5` (Lucide default está bom).
- Cor: herdar do contexto (`currentColor`). Em ícones de feature usar `text-accent`. Em ícones de UI neutra usar `text-ink-muted`.
- Trocar todos os `<svg>` inline em `app/page.tsx` (a função `FeatureIcon` lá) por imports diretos de Lucide. Mapeamento: `shield→Shield`, `lock→Lock`, `users→Users`, `check→Check`, `zap→Zap`, `send→Send`, `eye→Eye`, `file→FileText`, `repeat→Repeat`, `key→Key`, `hash→Hash`.

## 4 — Padrões para landing nova (Etapa 5)

### Estrutura
1. **Header global** (sticky, blur backdrop, `bg-bg/70 backdrop-blur-xl border-b border-border/60`). Logo à esquerda, nav central (`How it works`, `Use cases`, `Docs`, `Security`), `Connect wallet` button à direita (variant ghost) e `Open vault` (variant default accent).
2. **Announcement bar** (acima do header, opcional): `bg-accent-soft text-accent text-xs` com link sutil ("Devnet live · Read the audit →").
3. **Hero**: 
   - Eyebrow `text-eyebrow text-accent`: `PRIVATE EXECUTION INFRASTRUCTURE`.
   - Headline display split em 2 linhas, com a segunda linha em `text-ink-muted` (estilo Cloak): `Private execution / for shared treasuries.`
   - Subhead `text-lg text-ink-muted max-w-2xl`.
   - Dois CTAs: primary "Open a vault" (accent), secondary "How it works" (outline).
   - **Live counter**: `<NumberFlow>` mostrando `Sealed transactions · {N}` (mock 24,194 ou conectar API depois).
   - Diagrama animado abaixo: 3 nós (Squads multisig | Cloak Gatekeeper | Operator) ligados por linhas, com um token "License" dourado viajando do meio pra direita em loop framer-motion. Single-use seal, escassez visual.
4. **Trust bar / marquee**: logos parceiros (placeholders ok).
5. **How it works**: 3 cards (Prepare / Approve / Execute) com ícone, título display, body. Cada card tem widget visual mock pequeno.
6. **Use cases**: grid 2x2 ou 3x2 com cards grandes — Private Sends, Payroll, Audit Links, Stealth Invoices. Cada card tem widget funcional mock (ex: Send card mostra um "form" estilizado, Payroll mostra uma "tabela", Audit mostra um "badge scoped + link").
7. **Security/compliance**: seção "Auditable when required" — 3 colunas com viewing keys, scoped audit, compliance.
8. **For developers**: code block snippet do gatekeeper (mock acceptable).
9. **FAQ**: accordion. 6 perguntas core sobre privacidade, multisig, operador, TTL.
10. **CTA final**: full-bleed card com Æ gigante de fundo (`text-9xl text-accent/5 absolute`), title display, sub, botão primary + "View GitHub" outline. Opcional: globe Cobe ao fundo.
11. **Footer global**.

### Footer global
- 4 colunas: brand (Æ + tagline + status devnet/mainnet), Product (How it works, Use cases, Pricing, Security), Developers (Docs, GitHub, SDK guide), Company (About, Brand, Schedule a meet).
- Bottom bar: copyright "© 2026 Aegis. Private execution for shared treasuries.", links Terms/Privacy.
- Border top `border-border`. Background `bg-bg`. Text muted.

## 5 — Padrões para dashboard (Etapa 6)

### Layout `/cofre/[multisig]`
- **App shell**: header global do app (diferente do landing) sticky com Logo + multisig context + wallet button.
- **Top bar do cofre** (sticky abaixo do header): mostra cofre atual com:
  - `<Address value={multisig} />` copiável.
  - Threshold (ex: `2 of 3 · Threshold`).
  - Vault balance (em SOL e USDC, mono).
  - Operator badge (active/idle).
  - Botão "Switch vault" (abre command palette de multisigs conhecidos).
- **Side nav (md+)**: vertical, 200px wide. Items: Overview, Send, Payroll, Audit, Invoices, Proposals, Operator, Settings. Item ativo: `bg-accent-soft text-accent border-l-2 border-accent`.
- **Mobile**: side nav vira bottom tab bar OU drawer (vaul) com botão hamburger no header.
- **Content area**: `max-w-6xl mx-auto p-6`.
- **Breadcrumb** acima do título da página: `text-eyebrow` separadores `/`.

### Overview (página principal do cofre)
- 4 stat cards no topo: Total balance, Pending licenses, Active proposals, Sealed (last 30d).
- Grid 2-col: "Recent activity" (timeline) + "Quick actions" (grid de botões pra cada feature).
- Below: "Pending operator actions" — lista de licenças que precisam ser executadas, com CTA inline (esse é o seed do Operator Inbox; visualmente já entra agora mesmo sem auto-execução).

### Operator Inbox (slot global no shell, etapa visual agora)
- Implementar como `<OperatorInboxButton />` no header do cofre — badge com count se houver licenças pendentes.
- Ao clicar, abre um `<Sheet side="right">` com lista de licenças pendentes (mock vazio inicial é ok). Cada item: TTL pill, valor, recipient, botão "Execute". 
- O botão "Execute" hoje só navega para `/cofre/<m>/operator` com query param. **Não implementar auto-execução** (isso é Etapa 8).

## 6 — Padrões para telas de feature (Etapa 7)

Cada tela de feature segue o mesmo esqueleto:

```tsx
<DashboardLayout>
  <PageHeader
    eyebrow="PRIVATE SEND"
    title="Settle privately"
    description="Create a sealed transfer through your Squads vault."
    actions={<Button variant="ghost">View history</Button>}
  />
  <div className="grid gap-6 md:grid-cols-[1fr_360px]">
    <FormCard>{/* form com campos Aegis */}</FormCard>
    <SidePanel>{/* preview, fees, what happens next */}</SidePanel>
  </div>
</DashboardLayout>
```

- **PageHeader**: eyebrow (text-eyebrow text-accent), title (font-display text-4xl), description (text-ink-muted max-w-2xl), actions à direita.
- **FormCard**: card com seções separadas por `<Divider>`, cada seção tem eyebrow + campos.
- **SidePanel**: card sticky no scroll, mostra preview/computações em tempo real, totais, e o que acontece após submit. Em mobile, vira bloco abaixo do form.
- **Submit**: botão primary full-width no fim do form com micro-cópia abaixo (ex: "Creates a Squads proposal. Members must approve before execution.").

### Send
- Form: Recipient (textarea para stealth pubkey), Amount (input mono com sufixo SOL/USDC selecionável), Memo (textarea opcional).
- Side panel: Preview com From (vault truncated address), To, Amount, Estimated fee, "What happens next" (3 steps).

### Payroll
- Form: Upload CSV (drop zone com border-dashed border-border-strong, hover border-accent), preview da tabela parsed (com Mono em wallet/amount), totals.
- Cada linha da tabela: name, address (Mono truncated), amount (Mono), badge "valid"/"invalid".
- Side panel: total recipients, total amount, fees, expected proposals.

### Audit
- Form: Scope selector (radio com cards), Expiration (date picker), opcional descrição.
- Side panel: Preview do link audit, copy button, share buttons.
- Lista abaixo: existing audit links com TtlPill, scope badge, revoke action.

### Invoice
- Form: Recipient (opcional), Amount, Memo.
- Side panel: Generated claim URL (Mono + copy + QR code), expiration TTL pill.

### Operator
- Lista de licenças disponíveis. Cada licença card: payload hash (Mono short), amount, recipient, TtlPill, "Execute" button.
- Estado vazio: ícone shield, "No pending licenses.", "Once a proposal is approved and executed by the vault, you'll see licenses here."

### Proposals (`/cofre/[multisig]/proposals/[id]`)
- Top: status big (StatusBadge size lg + label), title, description.
- Tabs: Overview | Approvals | Execution | Audit.
- Overview: payload (Mono multiline), commitment check (component `CommitmentCheck` refatorado), threshold progress bar (accent), members list.
- Approvals: cada member com address, vote status, timestamp.
- Execution: license info se issued, TTL pill, operator status, execute button (se for operator + dentro do TTL).

### Claim público (`/claim/[stealthId]`)
- Página minimal sem header/footer pesados. Logo só no topo.
- Card central: "Stealth invoice", amount, "Claim now" button.
- Após claim: animação de confirmação, instructions.

### Audit público (`/audit/[linkId]`)
- Header minimal só com Æ.
- Stat row no topo (escopo, validade).
- Lista de transações em tabela densa, mono columns.
- Banner se expirado.

## 7 — Ordem de execução recomendada

1. **Fechar foundation (etapa 3 restante)** — sem isso nada renderiza certo:
   1. Refatorar `app/layout.tsx` (fonts, metadata, providers, sonner Toaster).
   2. Reescrever `components/ui/toast-provider.tsx` (delegar pro sonner, manter API).
   3. Refatorar `button.tsx`, `input.tsx`, `card.tsx`, `skeleton.tsx`, `dialog.tsx`, `sheet.tsx` (tokens Aegis).
   4. Reescrever `confirm-modal.tsx` em cima do novo Dialog.
   5. Conferir que `pnpm -F web dev` builda sem erro de tipo nem runtime.

2. **Shell global (etapa 4)**:
   1. Criar `components/site/SiteHeader.tsx` (landing).
   2. Criar `components/site/SiteFooter.tsx`.
   3. Criar `components/app/AppHeader.tsx` (dentro do `/cofre`).
   4. Criar `components/app/AppShell.tsx` que envolve `/cofre/[multisig]/*`.

3. **Landing (etapa 5)**:
   1. Reescrever `app/page.tsx` do zero usando o esqueleto da seção 4 deste handoff.
   2. Criar `components/landing/HeroDiagram.tsx` (animação Squads→Gatekeeper→Operator com framer-motion).
   3. Criar `components/landing/Marquee.tsx`, `UseCaseGrid.tsx`, `FAQ.tsx`, `CtaSection.tsx`.

4. **Dashboard shell (etapa 6)**:
   1. Criar `app/cofre/[multisig]/layout.tsx` (App Router layout) com AppShell + sidenav.
   2. Refatorar `app/cofre/[multisig]/page.tsx` (overview) — quebrar em sub-componentes por seção.
   3. Criar `components/app/OperatorInboxSheet.tsx`.

5. **Telas de feature (etapa 7)** — uma por vez, na ordem: Send → Payroll → Audit → Invoice → Operator → Proposals/[id] → Claim público → Audit público. Para cada uma:
   1. Ler arquivo.
   2. Identificar lógica (handlers, hooks, queries) — **não tocar**.
   3. Reescrever JSX usando os primitivos Aegis e o esqueleto FormCard+SidePanel.
   4. Aplicar tabela de migração de cores.
   5. Trocar SVGs inline por Lucide.
   6. Validar que o fluxo funcional ainda completa.

6. **Polish (etapa 9)**:
   1. Mobile pass — testar cada tela em < 768px.
   2. A11y pass — focus management nos modais, aria labels, keyboard nav nos sheets.
   3. Empty states em todas as listas.
   4. Loading skeletons em todas as queries.
   5. Error boundaries específicos por rota.

## 8 — Gotchas e regras

- **Wallet adapter CSS**: o `@solana/wallet-adapter-react-ui/styles.css` está importado no `layout.tsx` e injeta CSS próprio. Sobrescrever via `globals.css`:
  ```css
  .wallet-adapter-button {
    @apply bg-accent text-accent-ink hover:bg-accent-hover font-sans font-semibold rounded-lg;
  }
  .wallet-adapter-button-trigger { @apply bg-accent text-accent-ink; }
  .wallet-adapter-modal-wrapper { @apply bg-surface border border-border; }
  ```
- **Hydration mismatch**: `LenisProvider` e `Toaster` só rodam client-side. Garantir `"use client"` e renderizar dentro de Suspense se necessário.
- **next/font**: Fraunces tem axes `opsz` e `SOFT` — já configurados em `app/fonts.ts`. Para usar variation, aplicar `font-feature-settings` no Tailwind theme se quiser ajustes finos.
- **Não usar gradients arbitrários**: a marca rejeita gradients decorativos. Único caso permitido: hero radial fade `bg-radial-fade` (já no Tailwind config) — sutil glow accent no topo.
- **Não usar emojis**: nem em UI nem em copy. A marca é institucional.
- **Não usar `motion.div` em tudo**: framer-motion é caro. Usar só onde adiciona significado (entrada de seção, hover de card primário, transição de modal). Para animações pequenas, preferir CSS `animate-fade-in` do Tailwind config.
- **Lenis vs scroll lock**: ao abrir Dialog/Sheet, parar Lenis (`lenis.stop()` ou usar a classe `lenis-stopped` no html). Vaul já lida com isso pra drawers.
- **Z-index stack**: header `z-40`, dropdowns `z-50`, sheet/dialog backdrop `z-50`, sheet/dialog content `z-50` (interno), toaster sonner `z-[100]`.
- **Manter exports estáveis**: nunca remover um export que outros arquivos importam. Refatorar interno é livre, API pública é congelada nesta rodada.
- **Manter copy**: até segunda ordem, **não** alterar textos das telas de feature. Só os textos da landing são reescritos com o tom Aegis. Telas internas mantêm a copy atual para não exigir validação de produto agora.

## 9 — Checklist de aceitação por etapa

**Etapa 3 fechada quando:**
- [ ] `pnpm -F web dev` builda sem warnings novos.
- [ ] Abrir `/` mostra Fraunces no headline e Inter no body.
- [ ] Aba do navegador mostra "Aegis".
- [ ] Toast aparece via sonner.
- [ ] Modal antigo (ex: `confirm-modal`) abre com a nova estética.

**Etapa 4 fechada quando:**
- [ ] Landing tem header global novo + footer.
- [ ] `/cofre/<m>` tem AppShell com side nav.
- [ ] Operator Inbox sheet abre e fecha (mesmo vazio).

**Etapa 5 fechada quando:**
- [ ] Landing tem hero com diagrama animado (license traveling).
- [ ] Live counter NumberFlow gira.
- [ ] FAQ accordion funciona.
- [ ] Comparar visualmente com `cloak.ag` — Aegis está no mesmo "tier" (mas distinto).

**Etapa 7 fechada quando:**
- [ ] Cada tela de feature tem PageHeader + FormCard + SidePanel.
- [ ] Zero `bg-emerald-*`, `bg-neutral-*`, `text-neutral-*` em qualquer arquivo.
- [ ] Todos os ícones são Lucide.
- [ ] Todos os modais usam o novo Dialog centralizado.
- [ ] Todos os toasts usam sonner.
- [ ] Lógica funcional de cada tela continua passando os smoke tests do README.

## 10 — Comandos úteis

```bash
# Dev
pnpm -F web dev

# Typecheck
pnpm -F web typecheck

# Lint
pnpm -F web lint

# Verificar resíduos da migração de cores
rg -n "emerald|teal-(400|500)|neutral-(800|900|950)" apps/web/app apps/web/components

# Build full
pnpm prebuild:web && pnpm build:web
```

---

## Notas operacionais

- A pasta da rota `apps/web/app/cofre/` permanece, mas vamos refatorar conteúdo em vez de renomear.
- Não tocar em `programs/`, `packages/core/`, `tests/` durante o redesign — só web.
- Em cada etapa concluída, marcar checkbox no roadmap e adicionar uma seção `## Etapa N — Concluída` com decisões + arquivos tocados.
- Ao final do redesign, este documento vira o ADR (Architecture Decision Record) da identidade visual Aegis.
