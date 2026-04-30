# Aegis — Melhorias Detalhadas v2

> **Atualizado em 30/04/2026.** Esta versão substitui `MELHORIAS_DETALHADAS.v1.md.bak` e incorpora análise profunda da plataforma de referência **Squads.so** (`app.squads.so`).
>
> Objetivo: levar o Aegis a um nível de polimento, clareza e densidade de feature equivalente — ou superior — ao Squads, mantendo o nosso diferencial (privacidade via Cloak/commitments, payroll batches, scoped audit links, operator flow).

---

## Índice

- [Parte A — Análise da Referência (Squads.so)](#parte-a--análise-da-referência-squadsso)
- [Parte B — Onboarding / Criação do Vault (Wizard 3 Passos)](#parte-b--onboarding--criação-do-vault-wizard-3-passos)
- [Parte C — Dashboard (Redesign Completo)](#parte-c--dashboard-redesign-completo)
- [Parte D — Navegação Global e AppShell](#parte-d--navegação-global-e-appshell)
- [Parte E — Páginas Internas (Send, Payroll, Operator, Proposals, Audit, Invoice, Settings)](#parte-e--páginas-internas)
- [Parte F — Correções Funcionais (Bugs Críticos)](#parte-f--correções-funcionais-bugs-críticos)
- [Parte G — Sistema de Design](#parte-g--sistema-de-design)
- [Parte H — Mobile, Landing, Infra](#parte-h--mobile-landing-infra)
- [Parte I — Roadmap e Prioridades](#parte-i--roadmap-e-prioridades)

---

## Parte A — Análise da Referência (Squads.so)

### A.1 Por que Squads é a referência

- É a plataforma multisig nº 1 em Solana (~bilhões em TVL custodiados).
- Nosso protocolo já usa `@sqds/multisig` v4 como motor on-chain — fazemos sentido como **camada de privacidade + payroll + audit em cima do mesmo padrão**.
- O usuário que adota Aegis provavelmente conhece o Squads. Quanto mais "familiar + melhor" formos, menor o atrito de adoção.

### A.2 Princípios de design observados

1. **Dark-first, sóbrio, sem cor desnecessária.** Fundo quase preto (`#0A0A0B`-ish), tipografia branca/cinza, único acento sutil em foco e badges.
2. **Centralização do conteúdo principal em cards.** Tudo que é decisão importante mora num card centralizado com largura fixa (~480-560px), com header (título do card), corpo e ações no rodapé.
3. **Wizard com tabs lineares no topo.** Indicador de passo simples: 3 labels com underline no passo ativo; passos futuros em cinza esmaecido.
4. **Headers de página enormes e copy humana.** "Secure your on-chain assets in a few clicks", "Add members and configure security", "Review and confirm". Subtítulo curto e amigável.
5. **Avisos amarelos não-modais para riscos.** Pequeno triângulo + texto curto. Nunca toast — mora no próprio card. Ex: "Only add wallets that you fully control. Do not add CEX addresses."
6. **Transparência radical em fees.** No passo Review eles mostram o breakdown: platform fee + depósito que volta pra conta + network rent. **Nunca há surpresa.**
7. **Sidebar com account selector no topo.** O bloco superior da sidebar é o **vault atual** (avatar, nome, balance USD, threshold). Click expande dropdown de outros vaults + ação "create new".
8. **Top bar concentra status e identidade.** Direita: chip de aviso contextual ("No interactions") + Network Status com bolinha verde + saldo da wallet em SOL + pill da wallet truncada.
9. **Dashboard = centro de gravidade, não índice.** Total Balance grande + Send/Deposit/Trade como ações primárias + gráfico de histórico + Members/Threshold + tabs (Accounts/Coins/NFTs) + Limit Orders. Tudo numa única tela com hierarquia clara.
10. **Empty states informativos.** "Balance history will show up in 48 hours" — em vez de loading infinito, comunica o estado real.
11. **Promo persistente no rodapé da sidebar.** Pequeno card com gradiente sutil oferecendo a próxima etapa do funil (business account / earn 5% APY). Não bloqueia, é descartável.
12. **Footer da sidebar com Contacts / Help & Support.** Nunca esconda suporte.

### A.3 O que o Squads **não** faz e que é nosso diferencial

| Squads | Aegis |
|--------|-------|
| Send transparente | **Private send** com commitments + viewing keys |
| Sem payroll nativo (precisa de batch manual) | **Payroll batches** com CSV upload |
| Sem invoicing | **Stealth invoicing** com claim links |
| Auditoria genérica de TX | **Scoped audit links** com viewing key derivada |
| Operator = qualquer membro | **Operator flow** dedicado (executa licenças aprovadas) |
| Trade/Stake/Subscription como features | (Não foco — descartar para focar em privacidade) |

**Conclusão:** copiamos a **estrutura de navegação e densidade visual** do Squads, mas substituímos as features de trading/stake pelas nossas (Privacy/Payroll/Invoice/Audit/Operator). Não é cópia — é **Squads para quem precisa de privacidade**.

---

## Parte B — Onboarding / Criação do Vault (Wizard 3 Passos)

> **Estado atual:** `CreateMultisigCard.tsx` (522 linhas) é uma *single page* com members, threshold e operator num formulário só. Não há nome do vault, nem descrição, nem review, nem stepper, nem breakdown de fees.
>
> **Meta:** transformar em wizard de 3 passos espelhado no Squads (`/create-squad`).

### B.1 Layout geral do wizard

- Rota: `/create` (substitui o card atual em `/`).
- Header minimalista: apenas o logo Aegis no topo-esquerdo, Network Status + WalletButton no topo-direito. Sem sidebar.
- Centro da tela: stepper horizontal **Squad Details → Members & Threshold → Review** com underline no passo ativo (cor accent) e cinza nos demais.
- Abaixo do stepper: **título grande** (h1, ~36px) e **subtítulo curto** centralizados.
- Abaixo: card centralizado (~520px de largura) com o conteúdo do passo.
- Rodapé do card: dois botões — `Cancel`/`Back` (secundário, esquerda) e `Next`/`Confirm` (primário, direita).
- Animação de transição entre steps: fade + slide horizontal (framer-motion `AnimatePresence`).

### B.2 Passo 1 — Squad Details (Vault Details, no nosso caso)

**Header:**
- Título: "Secure your on-chain assets privately"
- Subtítulo: "Give your Aegis vault a name. You can always adjust the details later."

**Card "Create a Vault":**
- **Avatar/Identicon slot** à esquerda do nome (40x40px, redondo, com `+` se vazio).
  - V1: gerar identicon determinístico a partir do `createKey` (ou do nome).
  - V2: permitir upload de imagem (armazenar no Postgres como base64 ou em S3).
- **Vault name** — input principal, placeholder "Vault name", obrigatório, max 32 chars.
- **Vault Description (optional)** — input secundário, max 64 chars, label acima como "Vault Description (optional)".
- Validação inline: nome vazio → botão Next desabilitado.

**Persistência:**
- Vault name + description são salvos no Postgres na tabela `vaults` (criar) — chave primária = `multisigPda` (após criação).
- Antes da criação on-chain: armazenar em estado local + sessionStorage para resistir a refresh acidental.

**Arquivos novos:**
- `apps/web/app/create/page.tsx` (entrypoint do wizard)
- `apps/web/components/create-vault/WizardLayout.tsx`
- `apps/web/components/create-vault/Step1Details.tsx`
- `apps/web/components/create-vault/VaultAvatarPicker.tsx`
- `apps/web/lib/identicon.ts` (gerador determinístico)
- Schema Prisma: model `Vault { id String @id; multisigPda String @unique; name String; description String?; avatarUrl String?; createdAt DateTime; }`

### B.3 Passo 2 — Members & Threshold

**Header:**
- Título: "Add members and configure security"
- Subtítulo: "Add your team members and set the approval threshold"

**Card 1 — "Add initial multisig members":**
- Lista de membros, cada um com:
  - Label "Member 1", "Member 2", etc.
  - Input com a pubkey (Member 1 prefilled com a wallet conectada).
  - Botão de remover (lixeira) se index > 0.
  - **Avatar/identicon** à esquerda do input (12x12px) — feedback visual.
  - Validação: pubkey inválida → borda vermelha + mensagem inline.
  - Pubkey duplicada → borda amarela + mensagem "Already added".
- Botão `+ Add Member` (full-width, dashed border, sutil) — limite 10.
- **Aviso amarelo** (warning callout):
  > ⚠ Only add wallets that you fully control. Do not add CEX addresses, as they can't be used to sign transactions.

**Card 2 — "Set confirmation threshold":**
- **Slider horizontal** de 1 até `members.length`.
- Valor atual exibido como `X/Y` (ex: "1/2") à direita.
- Subtítulo: "Select the amount of confirmations needed to approve a transaction".
- **Aviso amarelo** quando threshold == 1 e members == 1:
  > ⚠ Add another owner as a backup. Losing access to your wallet will result in loss of access to your vault's assets.
- **Aviso amarelo** quando threshold == members.length (M-of-M) e members > 1:
  > ⚠ Requiring all members to sign means a single offline member blocks every transaction. Consider M-of-N where M < N.

**Card 3 — "Operator wallet" (nosso campo extra, não existe no Squads):**
- Input com pubkey do operator.
- Botões "Use my wallet" / "Use first member" / "Clear".
- Subtítulo: "Operators execute approved private transactions on your behalf. They can be a member or a separate hot wallet."

**Arquivos novos:**
- `apps/web/components/create-vault/Step2Members.tsx`
- `apps/web/components/create-vault/MemberRow.tsx`
- `apps/web/components/create-vault/ThresholdSlider.tsx`
- `apps/web/components/ui/warning-callout.tsx` (componente reutilizável: `<WarningCallout>...</WarningCallout>`)

### B.4 Passo 3 — Review and confirm

**Header:**
- Título: "Review and confirm"
- Subtítulo: "One last look at the selected parameters before the Vault is deployed"

**Card "Review your Vault":**
- **Cabeçalho do card:** avatar + nome do vault em h2, descrição abaixo em cinza (se houver).
- **Grid de 3 stat cards** (cada um com número grande, label embaixo, ícone discreto à direita):
  - **Members** — count.
  - **Threshold** — `X/Y`.
  - **Deploy fee** — `~0.103 SOL` (calculado dinamicamente).
- **Breakdown da deploy fee** (texto pequeno, ícone ⓘ):
  > This amount consists of a 0.001 SOL Squads protocol fee, 0.001 SOL Aegis registration fee, 0.02 SOL deposited into your vault for rent reserves, and ~0.0020 SOL network rent for account deployment. The deposit is yours and can be withdrawn at any time.
- **Lista expansível "What will be created"** (opcional, recolhido por padrão):
  - Squads multisig (with N members, M-of-N threshold)
  - Squads vault PDA (vault index 0)
  - Aegis Cofre PDA (private execution gatekeeper)
  - Initialization proposal (will need signatures if M > 1)

**Rodapé do card:**
- `Back` (secundário) | `Confirm` (primário, full-width-ish).
- Após `Confirm`: o card transforma-se em **progress modal inline** com 4 etapas (já existem em `useTransactionProgress`):
  1. Validate setup ✓
  2. Create Squads multisig (sign + confirm)
  3. Create vault bootstrap proposal
  4. Initialize vault (auto if threshold==1, else "Waiting for approvals")
- Cada etapa mostra status (idle/running/success/error), spinner quando running, link para o explorer com a signature quando success.
- Estado terminal: card de sucesso com endereço do vault + 2 CTAs: `Open Vault` (primário) e `Copy Address` (secundário).

**Arquivos novos:**
- `apps/web/components/create-vault/Step3Review.tsx`
- `apps/web/components/create-vault/DeployFeeBreakdown.tsx`
- `apps/web/lib/deploy-fee.ts` (calcula fee dinâmica baseada em rent + program fee)

### B.5 Estado, navegação e bugs evitados

- Estado do wizard num único `useReducer` ou Zustand store (`useCreateVaultStore`). Ações: `setName`, `setDescription`, `setAvatar`, `addMember`, `removeMember`, `updateMember`, `setThreshold`, `setOperator`, `next`, `back`, `reset`.
- **Lock de duplo clique no Confirm.** Ref `submittingRef` + estado `state === 'pending'` desabilita o botão.
- **Reuso da chave de criação se o wizard for abortado a meio:** ao voltar para `/create` com state existente em sessionStorage, perguntar "Resume previous draft?".
- **Bug 1.1 (proposals duplicadas) prevenido por design:** o passo de bootstrap só roda uma vez dentro do mesmo wizard run; se o usuário fechar e voltar, detectamos a multisig já criada e pulamos para "approve & execute" em vez de criar nova proposal.

---

## Parte C — Dashboard (Redesign Completo)

> **Estado atual:** `apps/web/app/vault/[multisig]/page.tsx` tem 632 linhas, mistura init banner + stat cards + addresses + recent proposals. Header duplicado com o AppShell.
>
> **Meta:** dashboard tipo Squads (screenshot 2), enxuto, com hierarquia clara, decomposto em componentes.

### C.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Top bar (AppShell): Vault dropdown | …  | NoInteractions chip   │
│                       Network Status • | Wallet 0.138 SOL | Pill │
├──────────┬──────────────────────────────────────────────────────┤
│ Sidebar  │  Dashboard ⟳                                          │
│ - Vault  │  ┌────────────────────────────────────────────────┐  │
│   selec  │  │ Overview                                       │  │
│ - Dash.  │  │   Total Balance                                │  │
│ - Tx     │  │   $1,243.78                                    │  │
│ - Mem    │  │   [↑ Send] [↓ Deposit] [⇄ Convert]            │  │
│ - Treas  │  │                          ┌─ Balance history ─┐│  │
│ - Priv   │  │                          │ (sparkline 30d)   ││  │
│ - Devs   │  │                          └───────────────────┘│  │
│ - Sett   │  └────────────────────────────────────────────────┘  │
│          │  ┌──────────────┐ ┌──────────────┐                   │
│          │  │ 2 Members    │ │ 1/2 Threshold│                   │
│          │  └──────────────┘ └──────────────┘                   │
│          │  Tabs: [Accounts] [Coins] [NFTs] [Shielded]          │
│          │  ┌─ Account list ─────────────────────────────────┐  │
│          │  │ Account 1   HBHw…gsFW   $1,243   100%   ↑ ↓    │  │
│          │  └────────────────────────────────────────────────┘  │
│          │  ┌─ Pending Proposals ────────────────────────────┐  │
│          │  │ #12 Send 0.5 SOL → 7Gh…    1/2 sigs   [View]  │  │
│          │  │ #11 Payroll batch 4 recip. 0/2 sigs   [View]  │  │
│          │  └────────────────────────────────────────────────┘  │
│          │  ┌─ Recent Activity ──────────────────────────────┐  │
│          │  │ 2h ago — Proposal #10 executed by you          │  │
│          │  │ 1d ago — 0.2 SOL deposited                     │  │
│          │  └────────────────────────────────────────────────┘  │
│          │  Promo card (sidebar bottom)                          │
│          │  Contacts | Help & Support (sidebar footer)           │
└──────────┴──────────────────────────────────────────────────────┘
```

### C.2 Componentes a criar

- `components/vault/VaultSelector.tsx` — bloco do topo da sidebar com avatar + nome + balance + threshold; clique abre dropdown com vaults salvos em sessionStorage + "Create new vault" + "Remove from list".
- `components/vault/OverviewCard.tsx` — Total Balance + 3 ações + sparkline (recharts ou visx).
- `components/vault/StatCard.tsx` — número grande + label + ícone (uso geral em Members, Threshold, Deploy fee).
- `components/vault/BalanceSparkline.tsx` — empty state "Balance history will show up in 48 hours" se < 24h de dados.
- `components/vault/AccountsTab.tsx` — tabela com Account/Balance/Weight/Actions.
- `components/vault/ShieldedTab.tsx` — **nosso diferencial**: mostra commitments do Cloak, último depósito shielded, nota viewing key.
- `components/vault/PendingProposalsCard.tsx` — lista compacta com link para detail.
- `components/vault/RecentActivityCard.tsx` — log resumido (puxar do audit).
- `components/vault/CofreInitBanner.tsx` — extraído do `page.tsx` atual; só aparece se `cofreStatus === "missing"`.
- `components/vault/QuickActionButton.tsx` — pill com ícone + label, usado no OverviewCard.

### C.3 Hooks a criar (data layer)

- `lib/hooks/useVaultBalance.ts` — saldo SOL + USD do vault PDA.
- `lib/hooks/useShieldedBalance.ts` — soma de commitments não gastos do Cloak. **Resolve bug 1.4.**
- `lib/hooks/useCofreStatus.ts` — status de inicialização (extrair do page.tsx atual).
- ✅ ~~`lib/hooks/useProposals.ts`~~ — **feito** como `lib/use-proposal-summaries.ts` (`useProposalSummaries`). React Query com `staleTime: 20s`, `gcTime: 5min`, **sem `refetchInterval`** — invalidação event-driven via `queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) })` após approve/execute/bootstrap. Cache compartilhado entre Dashboard, Proposals e AppShell. **Resolve F.2.**
- `lib/hooks/usePendingProposalsCount.ts` — derivado de `useProposalSummaries`, alimenta o badge global.
- `lib/hooks/useRecentActivity.ts` — eventos do audit (últimos 10).
- `lib/hooks/useBalanceHistory.ts` — pontos diários para o sparkline (Postgres + cron job).

### C.4 Decomposição do `page.tsx` atual

`vault/[multisig]/page.tsx` (632 linhas) → ~60 linhas:

```tsx
export default function VaultDashboardPage({ params }) {
  const { multisig } = use(params);
  return (
    <DashboardLayout multisig={multisig}>
      <CofreInitBanner />
      <OverviewCard />
      <div className="grid grid-cols-2 gap-4">
        <StatCard kind="members" />
        <StatCard kind="threshold" />
      </div>
      <DashboardTabs />
      <PendingProposalsCard />
      <RecentActivityCard />
    </DashboardLayout>
  );
}
```

Toda a lógica de `initializeCofre`, `createInitCofreProposal`, `loadOnchainProposalSummaries` migra para hooks dedicados.

### C.5 Remover header duplicado

- Excluir o `<h1>` + badge "Dashboard" + descrição que existem hoje no início do `page.tsx`.
- AppShell já mostra o vault no top bar.
- O título "Dashboard" do conteúdo principal vira o componente `<PageTitle>Dashboard <RefreshButton/></PageTitle>` (h2 com ícone de refresh à direita).

---

## Parte D — Navegação Global e AppShell

### D.1 Sidebar (substituir AppShell atual)

Estrutura nova, baseada no Squads:

```
┌───────────────────────────────┐
│  Logo Aegis                   │
├───────────────────────────────┤
│  ┌─ Vault Selector ─────────┐ │
│  │ [avatar]  vault-name   ▾ │ │
│  │           $1,243.78      │ │
│  │           Threshold 1/2  │ │
│  └──────────────────────────┘ │
├───────────────────────────────┤
│  ▦ Dashboard                  │
│  ⇄ Transactions               │
│  ⌘ Members                    │
│  ▼ Treasury                   │
│     • Send                    │
│     • Payroll                 │
│     • Invoices                │
│  ◔ Privacy                    │← nosso (Cloak/shielded)
│     • Shielded balance        │
│     • Audit links             │
│  ⌥ Operator                   │← nosso
│  ▼ Developers                 │
│     • API keys                │
│     • Webhooks                │
│  ⚙ Settings                   │
├───────────────────────────────┤
│  [promo card sutil]           │
├───────────────────────────────┤
│  ⊙ Contacts                   │
│  ? Help & Support             │
└───────────────────────────────┘
```

Cada item de nav:
- Ícone Lucide (16px).
- Label.
- Estado ativo: bg `accent-soft`, texto `accent`, borda esquerda 2px.
- Hover: bg `surface-2`.
- Itens com submenu: chevron à direita, expande inline.

### D.2 Top bar

Da esquerda para a direita:
- Mobile: hamburger.
- (vazio — vault já está na sidebar; manter espaço para breadcrumb futuro).
- **Direita (ordem):**
  1. **Status chip contextual** (amarelo quando há ações pendentes) — ex: `⚠ 2 proposals to sign` (clica e abre o inbox).
  2. **Network Status** — `Network ●` com bolinha verde/amarela/vermelha conforme RPC health (criar `useRpcHealth`).
  3. **Wallet balance pill** — `0.138 SOL` (saldo da wallet conectada, não do vault).
  4. **WalletButton** — pill com truncado da pubkey.

### D.3 VaultSelector (dropdown)

Click no bloco do topo da sidebar → painel:
- Vault atual destacado com check.
- Lista de outros vaults (de `sessionStorage`/`localStorage`).
- Cada item: avatar + nome + balance + endereço truncado.
- Ações finais:
  - `+ Create new vault` → vai para `/create`.
  - `↗ Import existing vault` → modal para colar pubkey de uma multisig.
  - `Manage vaults…` → modal full com edit name / remove.

**Resolve item 6 do v1.**

### D.4 Notificações globais

- Badge no item de nav `Transactions` mostra count de proposals com status `active` que precisam de **minha** assinatura (não todas).
- Toast global quando uma proposal que assinei é executada por outro membro.

---

## Parte E — Páginas Internas

### E.1 Transactions (substitui /proposals)

Espelhar o que Squads chama de "Transactions". Tabs no topo:
- **Queue** — proposals pendentes (status active).
- **History** — executadas + rejeitadas + canceladas.
- **Drafts** — rascunhos locais (Prisma `payrollDraft`, etc.).

Linha da tabela:
- ícone do tipo (Send / Payroll / Invoice / Config / Init)
- ID #N
- Resumo curto ("0.5 SOL → 7Gh…"), ou "Payroll • 4 recipients"
- Signatures progress bar `2/3`
- Status badge
- Idade ("2h ago")
- Ação contextual: `Sign` / `Execute` / `View`

Cancelar/Arquivar (resolve **1.3**):
- Pendente + sou criador → `Cancel proposal` (vermelho, abre confirm modal).
- Finalizada → `Hide` (apenas no client side, persiste em `localStorage` por wallet).
- Nunca delete real on-chain.

### E.2 Members

Página dedicada (não existe hoje):
- Tabela: avatar / pubkey / role (Member/Operator/Both) / signatures count / last active.
- Ação: `+ Add member` → cria proposal de config_transaction_add_member.
- Ação: `Remove` (com confirm) → cria proposal de remove_member.
- Ação: `Change threshold` → modal com slider (cria proposal).
- **Tudo on-chain via Squads program** (`config_transaction_*`).

### E.3 Send

Já existe (`vault/[multisig]/send`). Melhorias:
- Toggle no topo: `Public send` | `Private send` (Cloak). Default = Private (nosso diferencial).
- Em Private: explicar em uma linha "Recipient sees an unlinkable note. Only your viewing key reveals the source."
- Auto-detect: se valor + balance shielded é insuficiente, sugerir top-up automático.
- Recent recipients (do contacts).

### E.4 Payroll — Redesign

Já listado no v1 (2.4). Adições baseadas no Squads:
- Lista de "Recipients" sempre visível como tab paralela.
- Upload de CSV com preview: tabela com diff (✓ existente, + novo, ⚠ inválido).
- Dry-run: simula a transação e mostra fee total + commitments gerados antes de criar a proposal.
- Histórico com export CSV (já temos compliance-export.ts, expor no UI).

### E.5 Operator — Redesign

Já listado no v1 (2.3). Reorganização clara:
- Header: status do operator (Active / Inactive) com bolinha.
- 3 cards horizontais: **Operator Wallet** (endereço + saldo + botão `Top up`), **Permissions** (lista chips), **Pending Licenses** (count + CTA).
- Lista principal: "Licenses to execute" — cada licença é uma linha clicável com botão `Execute` direto.
- Histórico de execuções com link para a tx.

### E.6 Proposal Detail — Redesign

Já listado no v1 (2.5). Adições:
- Visual de assinaturas inspirado no Squads: avatar dos members, ✓ verde para quem assinou, — cinza para quem falta, ✗ vermelho para quem rejeitou.
- Timeline cronológica com ícones por evento.
- Seção `Technical details` recolhível (payload base64, hash, accounts envolvidos, simulation logs).
- Botão `Simulate` que roda `connection.simulateTransaction` e mostra logs antes de assinar.

### E.7 Audit — Revisão Completa

Já listado no v1 (3). Nova organização:
- **Tabs:** All / Proposals / Vault / Operator / Privacy.
- **Filtros:** date range, wallet, event type.
- **Export:** CSV + JSON + scoped audit link (já existe — promover na UI).
- Cada linha:
  - Ícone + tipo
  - Descrição humana ("Alice approved proposal #12")
  - Timestamp
  - TX signature (link explorer)
  - Wallet responsável

### E.8 Invoice (Stealth Invoicing)

Já existe. Pequenas melhorias:
- Lista de invoices criados, estado (pending claim / claimed / expired).
- QR code do claim link.
- "Preview as recipient" para conferir o que o pagador vê.

### E.9 Settings — Nova Página

Conforme v1 (4), com seções dedicadas e submenu:
- **General:** vault name, description, avatar.
- **Members & Threshold:** atalho para a página de Members.
- **Operator:** trocar wallet do operator (cria proposal).
- **Privacy:** gerenciar viewing keys, derivar nova, revogar.
- **Notifications:** email/webhook para eventos (nova proposal, execução, falha).
- **Developers:** API keys, webhooks, RPC override.
- **Danger zone:** remover vault da lista local, limpar drafts, etc. **Nunca deletar on-chain.**

### E.10 Addresses — embutido em Settings → General

Resolve item 5 do v1. Lista de endereços com copy/explorer:
- Multisig PDA
- Vault PDA (index 0)
- Cofre PDA
- Operator wallet
- Treasury (se aplicável)

---

## Parte F — Correções Funcionais (Bugs Críticos)

(reapresentação do v1 com refinamentos)

### F.1 Múltiplas proposals de inicialização do Vault

- **Causa raiz:** sem lock + sem checagem de proposal pendente.
- **Fix:**
  1. No `useInitializeCofre`, antes de criar a proposal, listar `proposalSummaries` filtradas por `kind === 'init-cofre' && status === 'active'`. Se existir, abortar e mostrar a já existente.
  2. `submittingRef` + `state === 'pending'` desabilita botão.
  3. Banner persistente "Initialization proposal #N is awaiting signatures" enquanto pendente.

### F.2 Sincronização de status de proposals — ✅ FEITO

- **Fix implementado:** `useProposalSummaries` em `apps/web/lib/use-proposal-summaries.ts` centraliza a query (`queryKey: ["proposal-summaries", multisig]`) com `staleTime: 20_000`, `gcTime: 300_000`, **sem polling fixo**.
- Polling de 5s removido do Dashboard, Proposals list e Inbox.
- Polling curto **mantido apenas no detalhe da proposal** (`vault/[multisig]/proposals/[id]`) onde o status on-chain ainda está aberto.
- `queryClient.invalidateQueries({ queryKey: proposalSummariesQueryKey(multisig) })` chamado após bootstrap (Dashboard), approve e execute (Proposal Detail).
- **Pendente (próximos passos):** Operator/load filtrar `status in ['active','pending']`; badge global migrar para hook derivado de `useProposalSummaries` em vez de fetch próprio.

### F.3 Cancel / Archive proposal

- Cancel: Squads program suporta `proposalCancel` para proposals em `active` se assinante. Implementar como mutation com `proposalCancel({ memo })`.
- Archive: client-side, `localStorage[vault][archived] = [proposalId, ...]`. Filtra do default; tab "Archived" para ver.

### F.4 Shielded balance travado

- **Causa raiz:** valor hardcoded ou desconectado do Cloak.
- **Fix:** `useShieldedBalance` consulta o programa Cloak por commitments do owner, soma valores não gastos.
- Empty state: "No shielded balance yet" + CTA "Make a private deposit".

### F.5 Wallet pedindo aprovação em páginas read-only

- **Causa raiz:** `useWalletAuth` é montado no layout do vault e dispara assinatura no mount.
- **Fix:**
  - `useWalletAuth` não assina no mount; expõe `fetchWithAuth` que assina **na primeira chamada que precisar de auth**.
  - Páginas read-only (`audit`, `operator/load`) usam endpoints públicos ou GET sem auth.
  - Endpoints que precisam de auth retornam 401 → o cliente então pede assinatura.

### F.6 Prisma DATABASE_URL

Conforme v1 (11). Recomendação: **PostgreSQL local via docker-compose para dev, mesma string em prod no Render**. Adicionar `docker-compose.yml` e `pnpm db:up` no package.json.

### F.7 Proteção do `commitmentClaim` em GET público — ✅ FEITO

- **Causa raiz:** o endpoint `GET /api/proposals/[multisig]/[id]` (e equivalentes em payrolls / invoice) retornava o `commitmentClaim` completo sem auth, expondo dados sensíveis (recipient real, valor, viewing key context) para qualquer um com o link.
- **Fix implementado:**
  - GET público **omite** dados sensíveis por padrão.
  - Dados sensíveis só são retornados quando a request inclui `?includeSensitive=true` **e** passa em wallet auth (assinatura válida + membro/operator do multisig).
  - Aplicado em `proposal detail` e `payroll detail`.
- **Pendente:** revisar `audit-links` públicos para o mesmo padrão (devem revelar somente o que a viewing key escopada permite).

---

## Parte G — Sistema de Design

### G.1 Tokens (Tailwind/CSS vars)

Refinar `tailwind.config.ts` e `globals.css` com tokens semânticos espelhando o Squads:

| Token | Valor (dark) | Uso |
|-------|--------------|-----|
| `--bg` | `#0A0A0B` | fundo da app |
| `--surface` | `#111114` | cards |
| `--surface-2` | `#17171B` | hover, inputs |
| `--border` | `#1F1F25` | linhas sutis |
| `--border-strong` | `#2A2A33` | focus |
| `--ink` | `#F5F5F7` | texto principal |
| `--ink-muted` | `#A8A8B3` | texto secundário |
| `--ink-subtle` | `#6E6E7A` | texto terciário |
| `--accent` | `#E5E5E7` (off-white) | CTA primário sóbrio (Squads usa quase branco) |
| `--accent-ink` | `#0A0A0B` | texto sobre accent |
| `--accent-soft` | `rgba(255,255,255,0.06)` | bg de selected |
| `--signal-success` | `#34D399` | bolinha verde |
| `--signal-warning` | `#FBBF24` | warning callouts |
| `--signal-danger` | `#F87171` | erros |

Substituir o accent verde-esmeralda atual por **off-white** para alinhar com o Squads (CTA branco com texto preto). Se quisermos diferenciar, usar **um accent neutro com leve tint roxo** (`#D4D4F5` por exemplo) — mas testar.

### G.2 Componentes base a padronizar

- `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>` — substituir os divs ad-hoc.
- `<StatCard>` — número grande + label + ícone canto direito.
- `<WarningCallout>` — triângulo amarelo + texto, sem CTA.
- `<InfoCallout>`, `<ErrorCallout>` — variantes.
- `<PageTitle>` — h1/h2 padrão de cada página com slot opcional para ações à direita.
- `<EmptyState>` — ícone + título + subtítulo + CTA opcional.
- `<Stepper>` — para wizards.
- `<SignatureProgress>` — barra/pill com `2/3`.
- `<AddressPill>` — endereço truncado + copy + link explorer.
- `<NetworkStatusChip>` — bolinha + label.
- `<DropdownMenu>` (radix-ui) — para vault selector e ações.

### G.3 Tipografia

- Headers: `Inter` ou `Geist` (já usado), tracking levemente apertado.
- Números (saldos, fees): tabular nums + variante mono no fallback.
- Hierarquia: h1 36, h2 24, h3 18, body 14, caption 12.

### G.4 Animações

- Padrão framer-motion `transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}` (já existe em `animations.tsx`).
- AnimatePresence em mudanças de step do wizard, modais e mudanças de tab.
- Sparkline com path animado.
- Sem parallax pesado — segue a sobriedade do Squads.

---

## Parte H — Mobile, Landing, Infra

### H.1 Mobile

(v1 item 9, sem mudanças.) Adicionar:
- VaultSelector vira modal full-screen ao invés de dropdown em < 768px.
- Wizard de criação: stepper colapsa para `1 / 3` em mobile.
- Top bar: balance pill some em < 480px (acessível via menu).

### H.2 Landing

(v1 item 8.) Adicionar:
- Seção "Why not just use Squads?" com tabela de comparação Squads vs Aegis (transparente sobre o quê adicionamos).
- Logo em lowercase `aegis` mantido (decisão tipográfica intencional).

### H.3 Infra

- Prisma + Postgres conforme F.6.
- Adicionar tabela `Vault` (B.2).
- Adicionar tabela `BalanceHistory` (point-in-time, cron job 1x/dia).
- RPC health endpoint para `useRpcHealth`.

---

## Parte I — Roadmap e Prioridades

### Sprint 1 — "Blockers + Fundação" (1 semana)

1. **F.6** Prisma/DB unblock.
2. **F.5** Wallet auth lazy.
3. **F.1** Init proposal lock.
4. ✅ ~~**F.2** Centralizar `useProposals` com React Query~~ — **feito** como `useProposalSummaries`.
5. ✅ ~~**F.7** Proteção do `commitmentClaim` GET~~ — **feito** (sensitive gating + wallet auth).
6. **G.1** Tokens de design refinados (CSS vars + Tailwind).
7. **G.2** Componentes base (`Card`, `StatCard`, `WarningCallout`, `EmptyState`, `Stepper`).
8. Migrar `OperatorInboxButton` (`AppShell.tsx`) para consumir `useProposalSummaries` em vez do `setInterval(5s)` próprio.
9. Migrar badge de Transactions para `usePendingProposalsCount` derivado da mesma query.

### Sprint 2 — "Wizard Onboarding" (1 semana)

1. **B.1-B.5** Wizard de criação 3 passos.
2. Schema `Vault` no Prisma + persistência de nome/descrição/avatar.
3. Identicon determinístico.
4. Deploy fee breakdown.

### Sprint 3 — "Dashboard + AppShell" (1.5 semanas)

1. **D.1-D.4** Sidebar nova + VaultSelector + Top bar.
2. **C.1-C.5** Dashboard decomposto.
3. **F.4** Shielded balance funcional.
4. Hooks `useVaultBalance`, `useShieldedBalance`, `useBalanceHistory`.

### Sprint 4 — "Transactions + Members" (1 semana)

1. **E.1** Transactions (queue/history/drafts).
2. **F.3** Cancel/Archive.
3. **E.2** Members page.
4. **E.6** Proposal detail redesign.

### Sprint 5 — "Páginas internas" (1.5 semanas)

1. **E.3** Send com toggle public/private.
2. **E.4** Payroll redesign.
3. **E.5** Operator redesign.
4. **E.7** Audit redesign.
5. **E.8** Invoice melhorias.
6. **E.9-E.10** Settings + Addresses.

### Sprint 6 — "Polish" (1 semana)

1. **H.1** Mobile total.
2. **H.2** Landing comparison.
3. **G.4** Animações finas.
4. Acessibilidade (axe-core), Lighthouse, performance budget.
5. Renomear commits (item 10 v1).

---

## Apêndice — Mapa de arquivos novos vs. modificados

**Novos:**
- `apps/web/app/create/page.tsx`
- `apps/web/components/create-vault/{WizardLayout,Step1Details,Step2Members,Step3Review,VaultAvatarPicker,MemberRow,ThresholdSlider,DeployFeeBreakdown}.tsx`
- `apps/web/components/vault/{VaultSelector,OverviewCard,StatCard,BalanceSparkline,AccountsTab,ShieldedTab,PendingProposalsCard,RecentActivityCard,CofreInitBanner,QuickActionButton}.tsx`
- `apps/web/components/ui/{warning-callout,empty-state,stepper,signature-progress,address-pill,network-status-chip,page-title,card}.tsx`
- `apps/web/lib/hooks/{useVaultBalance,useShieldedBalance,useCofreStatus,useProposals,usePendingProposalsCount,useRecentActivity,useBalanceHistory,useRpcHealth}.ts`
- `apps/web/lib/{identicon,deploy-fee}.ts`
- `apps/web/lib/stores/useCreateVaultStore.ts`
- `apps/web/prisma/schema.prisma` — novo model `Vault`, `BalanceHistory`.
- `docker-compose.yml` (Postgres dev).

**Modificados (significativamente):**
- `apps/web/components/app/AppShell.tsx` — nova sidebar + top bar.
- `apps/web/app/vault/[multisig]/page.tsx` — reduzido a ~60 linhas.
- `apps/web/components/create-multisig/CreateMultisigCard.tsx` — substituído pelo wizard.
- `apps/web/lib/use-wallet-auth.ts` — auth lazy.
- `tailwind.config.ts`, `apps/web/app/globals.css` — tokens.

**Removidos / aposentados:**
- `apps/web/components/create-multisig/CreateMultisigCard.tsx` (após o wizard estar pronto).
- Header interno duplicado em `vault/[multisig]/page.tsx`.

---

> **Próximos passos imediatos:**
>
> 1. Validar este documento.
> 2. Criar issues GitHub agrupadas por Sprint.
> 3. Começar Sprint 1 pelo F.6 (DB) — desbloqueia tudo.
> 4. Sprint 2 entrega o "wow moment" do produto: o wizard novo é o que o usuário vê primeiro.
