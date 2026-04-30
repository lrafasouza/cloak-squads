# Aegis — Handoff para Próximo Agente

> **Lido isto + `docs/MELHORIAS_DETALHADAS.v2.md` = você tem tudo que precisa.**
> Atualizado em 30/04/2026 às 11:37 (UTC-03).

---

## TL;DR — em 30 segundos

Aegis é um **Squads-like multisig com camada de privacidade (Cloak) + payroll batches + scoped audit + operator flow** em Solana.

A plataforma está funcional em devnet, mas o frontend precisa de retrabalho profundo para chegar ao nível visual e de UX do **Squads.so** (referência absoluta). Existe um documento de plano completo em `docs/MELHORIAS_DETALHADAS.v2.md` (672 linhas, 9 partes, 6 sprints).

**Sua missão:** executar o plano sprint a sprint. Sprint 1 já tem 2 itens prontos (F.2 e F.7). Continuar de onde parou.

---

## Ler primeiro (nesta ordem)

1. **`docs/MELHORIAS_DETALHADAS.v2.md`** — fonte da verdade. Análise da referência (Squads), wizard 3 passos, dashboard, AppShell, páginas internas, bugs, sistema de design, roadmap.
2. **`docs/ARCHITECTURE.md`** — visão de arquitetura do projeto (Squads + Cloak + Cofre PDA + operator).
3. **`docs/BACKEND_PLAYBOOK.md`** — convenções de API.
4. **`docs/API_AUTH_MATRIX.md`** + **`docs/API_CONTRACTS.md`** — quais endpoints precisam de wallet-auth e quais são públicos.
5. **`README.md`** — setup local.

Workspace: `/Users/rafazaum/Desktop/cloak-squads/`. Stack: Next.js 14 (App Router) + TS + Tailwind + shadcn-ish + Prisma (Postgres) + `@sqds/multisig` v4 + Solana web3.js + framer-motion + React Query.

Frontend mora em `apps/web/`. Programas Anchor em `programs/`. Core compartilhado em `packages/core/`.

---

## Estado atual do Sprint 1

### ✅ Concluído

- **F.2 — Sincronização de proposals** (centralização React Query)
  - `apps/web/lib/use-proposal-summaries.ts` — `useProposalSummaries(multisig)` com `staleTime: 20s`, `gcTime: 5min`, sem polling fixo.
  - Polling de 5s removido de Dashboard, Proposals list e Inbox.
  - Polling curto mantido em `vault/[multisig]/proposals/[id]` (status aberto).
  - Invalidação event-driven via `queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) })` em bootstrap, approve e execute.

- **F.7 — Proteção do `commitmentClaim` em GET público**
  - GET público omite dados sensíveis por padrão.
  - `?includeSensitive=true` + wallet auth obrigatórios para revelar.
  - Aplicado em proposal detail e payroll detail.

### 🔥 Próximas tarefas (ordem recomendada)

#### 1. Limpar resíduos do F.2 (rápido, fecha o loop)
- `apps/web/components/app/AppShell.tsx:226-233` — `OperatorInboxButton` ainda tem `setInterval(() => void refreshInbox(false), 5000)`. **Substituir** por consumo direto de `useProposalSummaries(multisig)` + `useMemo` para derivar os items (mesmo filtro: `proposal.hasDraft && proposal.status === 'executed'`).
- Garantir que o badge de Transactions na sidebar nova use o mesmo hook (Sprint 1 item 9).

#### 2. F.6 — Prisma DATABASE_URL (desbloqueia tudo)
- `apps/web/prisma/schema.prisma` declara `provider = "postgresql"`.
- `.env.local` provavelmente está com `file:./dev.db`.
- Criar `docker-compose.yml` na raiz com Postgres 16.
- Adicionar script `pnpm db:up` no `package.json` raiz.
- Atualizar `.env.example` e `apps/web/.env.local`.
- Rodar `pnpm -F web exec prisma migrate dev`.
- **Validar:** GET `/api/payrolls/[multisig]` deixa de retornar erro de provider.

#### 3. F.5 — Wallet auth lazy
- `apps/web/lib/use-wallet-auth.ts` está sendo montado no layout do vault e dispara assinatura no mount.
- Refatorar para **não assinar no mount**. Expor `fetchWithAuth` que assina **apenas na primeira chamada que precise**.
- Endpoints que precisam: 401 → cliente pede assinatura.
- Páginas read-only (`audit`, `operator/load`): nunca devem trigar prompt.

#### 4. F.1 — Lock de proposal de inicialização do Cofre
- `apps/web/components/create-multisig/CreateMultisigCard.tsx` (será aposentado pelo wizard novo, mas o bug existe hoje).
- Antes de criar a init proposal, listar proposals existentes e filtrar `kind === 'init-cofre' && status === 'active'`. Se existir, abortar com mensagem.
- Adicionar `submittingRef` + estado pending para travar o botão.
- Banner persistente "Initialization proposal #N awaiting signatures".

#### 5. G.1 — Tokens de design
- Substituir cores em `apps/web/app/globals.css` e `apps/web/tailwind.config.ts` pelos tokens da tabela em **G.1 do v2**.
- Decisão pendente com o usuário: accent off-white (Squads-like) ou neutro com tint roxo. **Default sugerido: off-white** — confirmar antes de aplicar globalmente.

#### 6. G.2 — Componentes base
- Criar em `apps/web/components/ui/`:
  - `card.tsx` (Card, CardHeader, CardBody, CardFooter)
  - `stat-card.tsx`
  - `warning-callout.tsx` (variantes: warning/info/error/success)
  - `empty-state.tsx`
  - `stepper.tsx`
  - `signature-progress.tsx`
  - `address-pill.tsx`
  - `network-status-chip.tsx`
  - `page-title.tsx`
- Cada componente: tipado, acessível, com Storybook-like preview no próprio file (comentário com exemplo).
- Migrar 1-2 usos existentes para validar a API antes de seguir adiante.

---

## Sprints seguintes (resumo)

- **Sprint 2 (1 semana):** Wizard de criação 3 passos. Rota `/create`. Substitui `CreateMultisigCard`. Schema `Vault` no Prisma (name, description, avatarUrl). Identicon determinístico. Deploy fee breakdown. **Detalhes em B.1-B.5.**
- **Sprint 3 (1.5 semanas):** AppShell novo (sidebar + VaultSelector + top bar com Network Status) + Dashboard decomposto (632→60 linhas) + `useShieldedBalance` (resolve F.4). **Detalhes em C e D.**
- **Sprint 4 (1 semana):** Transactions (queue/history/drafts) + F.3 (cancel/archive) + Members page + Proposal detail redesign.
- **Sprint 5 (1.5 semanas):** Send (toggle public/private), Payroll, Operator, Audit, Invoice, Settings, Addresses.
- **Sprint 6 (1 semana):** Mobile, landing comparison "Why not Squads?", animações, a11y, performance.

---

## Princípios de execução (não-negociáveis)

1. **Squads.so é a referência visual.** Acessar `app.squads.so` em qualquer dúvida. Screenshots no histórico do chat.
2. **Dark-first, sóbrio.** Nada de cores chamativas. Accent quase branco. Warnings amarelos só em pontos críticos.
3. **Card centralizado para decisões.** Wizard, modais, formulários importantes — sempre num card de ~520px com header/body/footer.
4. **Transparência radical.** Em qualquer fee, mostrar o breakdown (platform / rent / network / depósito retornável). Squads faz isso e ganha confiança.
5. **Empty states informativos**, nunca spinner solto.
6. **Microcopy humana** nos modais de progresso (ver tabela em **2.1 do v1.bak** que ainda vale como baseline).
7. **Não introduzir polling fixo.** Use React Query com staleTime razoável + `invalidateQueries` em mutations. Padrão já estabelecido em `useProposalSummaries`.
8. **Não duplicar headers.** AppShell já mostra o vault no top bar. Páginas usam `<PageTitle>` enxuto.
9. **Decompor antes de redesenhar.** `vault/[multisig]/page.tsx` (632 linhas) deve virar ~60 com hooks e componentes extraídos.
10. **Bugfix discipline:** root cause > workaround. Single-line fix > over-engineering. Sempre que possível, prevenir a classe inteira do bug por design (ex: F.1 prevenido no design do wizard via state machine).

---

## Comandos úteis

```bash
# dev
pnpm -F web dev

# typecheck
pnpm -F web exec tsc --noEmit

# lint
pnpm -F web exec biome check .

# tests
pnpm -F web test
pnpm test  # raiz

# prisma
pnpm -F web exec prisma migrate dev
pnpm -F web exec prisma studio
```

Wallet de teste do usuário (por screenshots): `Qqib...qST5`. Multisig devnet ativa: `8Dwd3W6rc5rSuLP6EQKuZQMaafucGnaoQZNuZLbMWJkw` (visto nos logs).

---

## Decisões pendentes do usuário

1. **Accent color:** off-white (Squads-like) vs. neutro tint roxo `#D4D4F5`. → Perguntar antes de aplicar G.1 global.
2. **Wizard route:** `/create` substitui o card em `/`, ou coexiste? → Recomendação: substituir, manter `/` como landing pública.
3. **`Privacy` na sidebar:** item próprio ou submenu de Treasury? → Recomendação: item próprio (é o nosso diferencial).
4. **Trade/Stake/Subscription do Squads:** descartar de vez, ou manter shells "coming soon"? → Recomendação: descartar.

---

## Arquivos críticos (mapa rápido)

```
apps/web/
├─ app/
│  ├─ page.tsx                              ← Landing (347L)
│  ├─ vault/[multisig]/
│  │  ├─ page.tsx                           ← Dashboard (632L) — DECOMPOR
│  │  ├─ proposals/[id]/page.tsx            ← Proposal detail (já invalida cache)
│  │  ├─ {audit,operator,payroll,send,
│  │  │   invoice,proposals}/               ← Páginas internas
│  │  └─ layout.tsx
│  └─ api/
│     ├─ proposals/[multisig]/
│     ├─ payrolls/[multisig]/               ← inclui sensitive gating (F.7)
│     └─ audit-links/                       ← TODO: aplicar F.7
├─ components/
│  ├─ app/AppShell.tsx                      ← REDESENHAR (sidebar nova + top bar)
│  ├─ app/OperatorInboxSheet.tsx            ← Migrar para useProposalSummaries
│  ├─ create-multisig/CreateMultisigCard.tsx ← APOSENTAR (Sprint 2)
│  ├─ proposal/ApprovalButtons.tsx
│  └─ ui/                                   ← componentes base (G.2 expand)
├─ lib/
│  ├─ use-proposal-summaries.ts             ← ✅ React Query centralizado
│  ├─ use-wallet-auth.ts                    ← REFATORAR lazy (F.5)
│  ├─ proposals.ts                          ← load on-chain + persisted + merge
│  └─ squads-sdk.ts                         ← wrappers do @sqds/multisig
└─ prisma/schema.prisma                     ← provider postgresql; precisa Vault model
```

---

## Como reportar progresso

Ao final de cada sprint, atualize `docs/MELHORIAS_DETALHADAS.v2.md`:
- Marque itens com `✅ FEITO` + descrição curta do que ficou pronto.
- Liste pendências da sprint que escaparam.
- Atualize a Sprint correspondente em **Parte I**.
- Commit message no padrão: `feat(web): <descrição curta>` ou `fix(web): ...`.

Se descobrir algo que não está no v2, adicione antes de implementar.

---

**Boa sorte. Squads é a régua. Privacidade é o diferencial. Sobriedade é o tom.**
