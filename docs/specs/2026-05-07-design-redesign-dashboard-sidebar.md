# Aegis — Design Redesign (Dashboard + Sidebar + System)

> Date: 2026-05-07
> Owner: Rafael
> Status: Direction locked, implementation backlog drafted
> Scope: Dashboard, Sidebar, AppShell topbar, OverviewCard, TreasuryFlowStrip, PendingProposalsCard, RecentActivityCard, modals (Send/Receive/Swap/Privacy), card system, button system, type scale, motion. Cascades into all secondary pages.

---

## 0 · TL;DR

We already have a rare, defensible aesthetic seed: **heraldic dark + burnished gold + Fraunces/EB Garamond serif + Æ monogram**. Almost nobody in crypto fintech uses serifs. The current implementation does not commit hard enough — we lean too often on generic shadcn-dark patterns (uniform `rounded-2xl bg-surface border-border` everywhere, three identical KPI cards, hover-glow-on-everything).

The fix is **commit harder to the heraldic identity, not pivot away from it**. Codename for the direction: **"Heraldic Workstation"** — vaultlike serif moments + dense data panels + restrained warm-monochrome chrome + a privacy halo we own.

This document specifies:
1. What's wrong today, ranked by visibility.
2. The locked design direction (not a vibe — a hard rulebook).
3. Concrete redesigns for Sidebar, Dashboard, Cards, Modals, Topbar.
4. Token + component diffs ready to implement.
5. A 4-sprint rollout that ships the changes without burning the codebase.

---

## 1 · Where we are vs. where we're going

### Current state — honest critique

I read every dashboard component, the AppShell, the modals, `globals.css`, `tailwind.config.ts`, `fonts.ts`, and the brand `Logo.tsx`. The 12 most visible problems, in order of "first thing a designer would notice":

| # | Problem | Where | Why it hurts |
|---|---|---|---|
| 1 | **Every card uses the same shell**: `rounded-2xl border border-border/60 bg-surface hover:border-accent/15` | OverviewCard, TreasuryFlowStrip × 3, Governance/Cloak split, PendingProposals, RecentActivity | The dashboard reads as 6 identical containers stacked. No hierarchy. The hover-glow on every card is the textbook "shadcn AI-slop" tell. |
| 2 | **Three perfectly equal KPI cards** (Inflow / Outflow / Privacy share) | TreasuryFlowStrip | Strong AI-slop signal (anti-ai-slop §"Three-column feature grid repeated"). They're the most important Aegis-specific KPI and they look like template cards. |
| 3 | **Sidebar is dense + dark + has decorative dimming** but the content area uses the *same* surface tone (`bg-surface`) | AppShell | Linear's principle: sidebar dim, content brighter. Today both are the same `hsl(220 12% 9%)`, so the sidebar reads as part of the page, not as chrome. |
| 4 | **No editorial moment.** Fraunces is loaded but only used at 3xl/4xl on numbers and the modal title. The Æ monogram lives in the corner, never as a watermark/crest. | Logo + every page header | The serif is what makes us *not* Squads. We barely use it. |
| 5 | **Dashboard has no hero — it has a header.** "Dashboard / Vault Name" is a 20px h1 with a 44px identicon. It looks like a sub-page in any SaaS. | VaultDashboard top | The dashboard is the front door. It should announce the vault. |
| 6 | **Action buttons in the OverviewCard** are 3 identical pills (Send / Deposit / Swap) with the same height. Send is filled gold, the other two are outlined ghosts. The visual weight ratio (1 primary, 2 ghost) is right, but they're squashed at 2.5 padding-y, no icon hierarchy, and they share a row with a refresh button that fades in on hover. | OverviewCard:186–211 | Quick-actions deserve more presence on a privacy app — they're literally the product. |
| 7 | **Governance / Cloak Privacy** is a single card split in half with `flex-1 px-5 py-4`. The two halves are presented as equals (governance = privacy) but they're different concepts. | VaultDashboard:219–326 | The split feels like "we ran out of design ideas". Privacy is the moat, governance is shared with Squads. They should not look symmetric. |
| 8 | **Sidebar nav uses bg-accent-soft + text-accent on active**, with a 2px gold bar on the left edge. That's correct. But the whole sidebar then has a fading `bg-surface/[0.5] backdrop-blur-xl` over `border-white/[0.04]` — i.e. transparent on a dark page, which looks washed-out. | AppShell:506 | The sidebar currently looks "translucent for no reason." |
| 9 | **VaultSelector card** uses `border-accent/50 bg-surface shadow-raise-1` open vs `border-border` closed, plus a green check pip. The Check pip says "selected". But this control is the **vault you're currently viewing** — there's nothing to select. The pip is decorative. | VaultSelector:294–298 | Decorative chrome on the most-clicked control on the page. |
| 10 | **OverviewCard "Show details"** is a 3-state breakdown panel that grid-template-rows expands. Inside it, a row-per-token list. This is a hidden secondary panel for the most important data on the page. | OverviewCard:117–183 | "Tokens you own" should not be 1 click away from default. |
| 11 | **PendingProposalsCard renders nothing** when `pending.length === 0`, leaving a hole in the layout that re-appears once anything is queued. | PendingProposalsCard:30 | Either show zero-state or re-flow the dashboard. Right now it pops into existence. |
| 12 | **Modals** use `bg-surface/80 backdrop-blur-md` overlay + `rounded-xl border border-border bg-surface shadow-raise-2`. Dialog title is Fraunces 18px. Standard shadcn-dark modal — it's fine, but it isn't *Aegis*. No vault crest, no left ribbon, no monospace receipt-style detail rows. | ui/dialog.tsx | The modal is where we sign value. It deserves identity. |

There are smaller paper cuts (every eyebrow is `text-eyebrow text-ink-subtle`, every divider is `border-border/60`, hover transitions are `transition-colors duration-200` with no easing curve) but they all dissolve once we apply the rulebook below.

### What's already great (do NOT touch)

- **Color tokens** — the heraldic gold #C9A86A on near-black `hsl(220 13% 5%)` is restrained and rare. Do not introduce a second accent.
- **Type stack** — Fraunces / EB Garamond / Inter / Geist Mono is editorial, technical, and has a legit narrative ("EB Garamond for the Æ crest, Fraunces for hero numbers, Inter for UI, Geist Mono for hashes"). Keep it.
- **`shadow-raise-1/2`, `shimmer-bg`, `text-eyebrow`, `tabular-nums`** — these primitives are the foundation. Use them harder.
- **`useTreasuryFlow` privacy share** — the *data* is genuinely Aegis-only. Squads cannot show "% of outflow shielded". The visual treatment should make it look like the moat it is, not a third KPI.

---

## 2 · Direction: "Heraldic Workstation"

The locked direction. This is what every component is graded against from now on.

```
Direction: Heraldic Workstation
            (Luxury/Refined × Warm Monochrome × Workstation Dense, with editorial serif moments)
Density:   Comfortable on chrome, dense on data, spacious on the hero balance
Surface:   Asymmetric. Sidebar dim + chrome content surface bright + hero is its own territory
Type mood: Vaultlike, technical, ledger-like, restrained
Motion:    Crisp aegis-easing (cubic-bezier(0.16, 1, 0.3, 1)), entrances longer than exits, no bounce
Do:
  · Use Fraunces at 56–72px on the dashboard hero, italic-on-eyebrow as a brand quirk
  · Use the Æ monogram as a watermark inside the OverviewCard background
  · Use Geist Mono for ALL on-chain values, addresses, vault indices, txn hashes
  · Lean on borders + background shade for separation, not shadows or hover glow
  · Reserve burnished-gold for: active nav, primary CTA, "shielded" indicators, and *nothing else*
  · Differentiate radii by component role: data tables 12px, cards 20px, modals 24px, hero 28px
  · Asymmetric layouts where it carries meaning (privacy on the right, governance on the left)
Don't:
  · Do NOT add a second accent color, ever (no purple/blue/green for sub-states — use neutral or the gold)
  · Do NOT use glassmorphism decoratively. Backdrop-blur belongs on top-bar/sticky chrome only
  · Do NOT use the same card shell for hero + KPIs + governance + activity
  · Do NOT three-column-grid the KPIs as equal siblings
  · Do NOT apply hover-glow on every card. Glow is rare, reserved for the privacy halo
  · Do NOT bounce. Springs are too consumer for a treasury product.
```

### Why this direction beats Squads / Mercury / Phantom

- **Squads v4** went light + warm fintech (Mercury-influenced). We're dark + heraldic + serif. Already differentiated.
- **Mercury** owns muted dark + Arcadia + restrained gradients. We're dark too, but with serifs on hero numbers and a heraldic Æ. Different vocabulary.
- **Phantom** is Soft Consumer (rounded, friendly, mobile-first). We're Workstation Dense — multisig is a power-user product, not a wallet.
- **Drift / Jupiter** are pure Workstation Dense (multi-color semantic, terminal-style). We're more restrained — a single accent + serif moments make us read as private-banking, not as a trading terminal.

The convergence test ("if AI made this, would they believe it?") should fail for our redesign — Fraunces serif numbers + Æ heraldic monogram + privacy halo are not AI defaults.

---

## 3 · Sidebar redesign

### Current
- 288px wide (`w-72`), full-bleed surface tone, 3 collapsible sections (Workspace / Governance / Privacy & Vault), Cloak banner above bottom nav.
- Active state: `bg-accent-soft text-accent` + 2px gold left bar.
- VaultSelector at top, Help & Docs row at the bottom that does nothing.

### Problems
- Sidebar surface = content surface. No depth.
- VaultSelector is the visual anchor but reads as a heavy card on a translucent strip.
- 7 items in Workspace, 3 in Governance, 2 in Privacy & Vault — sections feel arbitrary.
- "Help & Docs" is a fake nav item.
- No quick action — every action requires going to Dashboard or a sub-page first.

### Redesigned — spec

```
Width:      256px desktop, hover-expand to 288px optional (Linear pattern)
Surface:    bg-bg (pure background) + 1px right border in border/40
            Content area uses surface (one shade lighter)
            ⇒ creates the "sidebar dim, content bright" depth Linear codified
Vertical hierarchy (top → bottom):
  1. Logo lockup (Æ + Aegis), 56px tall, no border
  2. VAULT CREST card — see §3.1 below (replaces VaultSelector header)
  3. Inline "Send Private" CTA — see §3.2 (gold-filled, full-width, primary action)
  4. Section: WORKSPACE
       Dashboard, Send Private (compact), Swap, Payroll, Recurring, Operator, Invoices
       NOTE: Send Private also appears as nav item — the CTA above is the shortcut, the nav is canonical
  5. Section: GOVERNANCE   (Transactions, Members, Audit) + queue badge on Transactions
  6. Section: ACCOUNTS     (rename "Privacy & Vault" → "Accounts" — clearer to operators)
                            Sub-vaults, Address Book
  7. (flex spacer)
  8. Privacy meter strip — see §3.3 (replaces Cloak banner)
  9. Settings (single row)  + theme toggle as right-side affordance
  Remove "Help & Docs" placeholder. Move Help into Settings page.

Active state:
  - Background: bg-accent-soft (unchanged, this is correct)
  - Text/icon: text-accent
  - Left rail: replace 2px gold bar with a 3px gold rail that has soft 4px outer glow.
              The rail should feel like a brass strip embedded in dark wood.
  - Add micro-Æ glyph at 8px size right-aligned on hover, fading in over 120ms

Hover (inactive):
  - bg-surface-2 (NOT translucent)
  - 0.5px translate-x — subtle, not 0.5 like today (which is fine, keep)
  - icon goes from ink-subtle → ink

Section labels:
  - Currently text-[10px] uppercase tracking-wider ink-subtle/60
  - Change to font-display italic 11px, tracking-eyebrow, color ink-subtle/50
    ⇒ this is the editorial moment. Italic Fraunces section labels read as a vintage
       ledger; nobody else in crypto does this and it's a pure win
  - Keep collapse chevron on right
```

### 3.1 — Vault Crest card (replaces today's VaultSelector pill)

```
[ ====== rounded-xl 14px, padding 12px 14px, bg-surface-2 ======= ]
[                                                                  ]
[  ┌──────────┐  Treasury name       ChevronsUpDown ⇅              ]
[  │ Æ idntcn │  Address truncated                                 ]
[  │ 40×40 px │  font-mono 10px                                    ]
[  └──────────┘                                                    ]
[                                                                  ]
[  $84,210.55 USD     ⌁ 12.4 SOL        +2.1% 30d (subtle)         ]
[                                                                  ]
[ ================================================================ ]

- Identicon: keep the deterministic SVG you already have, but composite the Æ
  glyph at 25% opacity *behind* the squares (the watermark moment). One line
  of layered <text> + identicon SVG.
- Balance line: Geist Mono, 13px, tabular-nums, USD bold ink, SOL ink-muted
- Drop the green "selected" check pip (decorative).
- Drop the LogOut icon (move to dropdown menu).
- Click anywhere on the card → switcher opens; chevron is just a hint.
```

The card is the **only place** in the sidebar where the gold accent actively decorates (via the watermark Æ tinted gold/4% opacity). It anchors the eye.

### 3.2 — Inline "Send Private" CTA

A 36px-tall full-width button right under the Vault Crest:

```
┌────────────────────────────────────────┐
│ [icon] Send Private        ⌘K          │
└────────────────────────────────────────┘
- bg: gradient from accent → accent-hover, 80% opacity in idle, 100% on hover
- text: accent-ink (near-black), 13px, font-medium
- icon: Lock (privacy connotation), not Send
- right-side: ⌘K hint (opens command palette pre-filled with "send private")
- This button is the product — making it a sidebar fixture is intentional
```

This replaces the "promote action" the OverviewCard's gold Send button is currently doing alone.

### 3.3 — Privacy meter strip (replaces Cloak banner)

Today's `CloakBanner` is verbose and ad-like. Replace with a **live KPI strip** sized 64px tall that mirrors the dashboard data:

```
[ ───── PRIVACY  ──────────────────── ]
[ 78% shielded                         ]
[ ████████████████░░░░  30d           ]
[                                      ]
- "PRIVACY" label = font-display italic 10px (editorial section label)
- "78% shielded" = Fraunces 16px tabular-nums, accent
- Bar: 4px tall, gold for shielded segment, ink-subtle/40 for public
- "30d" right-aligned, 9px mono
- Click → /audit page
```

This earns the bottom-left corner because it constantly reinforces the only KPI that nobody else can show. It IS the marketing in-app.

---

## 4 · Dashboard redesign

### Page-level layout (12-col grid, 1280px container, 48px gutter top)

```
Row 1 (HERO — 200px tall):
  Æ-watermarked treasury hero card, full-bleed inside main content
  (replaces "identity row + OverviewCard" — fold them into one block)

Row 2 (KPI ribbon — 132px tall):
  Three asymmetric panels: Inflow ⨯ 3-col, Outflow ⨯ 3-col, Privacy share ⨯ 6-col
  ⇒ Privacy gets DOUBLE the width — visual moat

Row 3 (Governance ribbon — 80px tall):
  Single-line panel: "M-of-N · X members · timelock Yh" left, "Manage members →" right
  This is reference info, not data — give it 1 row, not a half-card
  Cloak Privacy half is REMOVED — privacy is now in row 2 + sidebar meter, not duplicated

Row 4 (Action queue + Activity, 50/50 split, 8-col + 4-col):
  Left  (8-col): Pending Proposals (taller, with empty-state)
  Right (4-col): Recent Activity (tighter rows, signature column)
  Or stack on <lg.

(Mobile: everything stacks; KPIs become a horizontal scroll-snap row.)
```

This is the only time we asymmetric-grid. Everything inside follows one of two card archetypes (§5).

### 4.1 — Treasury Hero card (replaces OverviewCard)

This is the front door. It earns 200–240px of vertical real estate.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [eyebrow]  TOTAL TREASURY · LIVE                            [⟳]     │
│                                                                      │
│  $84,210.55                          ┌─────── ACTIONS ──────┐        │
│  Fraunces 64px, tabular, ink         │  [Send Private]     ★│        │
│                                      │  [Deposit]           │        │
│  12.4023 SOL · 12,300.00 USDC        │  [Swap]              │        │
│  Geist Mono 13px, ink-muted          │  [More ⋯]            │        │
│                                      └──────────────────────┘        │
│                                                                      │
│  ────────── PRIVACY HALO (full-width, 1px gold at 30% opacity) ───── │
│  [breakdown by sub-vault, horizontal pill row, only when hover/click]│
└──────────────────────────────────────────────────────────────────────┘

Background:  bg-surface, with the Æ monogram rendered SVG-stroked
             (not filled) at 360px × 360px, accent-tinted at 4% opacity,
             positioned bottom-right with 60% offset. Watermark, not decoration.
Border:      1px border/60 + 1px inset highlight at top (ink/3% opacity)
             to catch light — gives the "embossed brass plaque" feel
Radius:      24px (xl-lg-ish — bigger than KPI cards)
Shadow:      raise-2 (deep, low-opacity drop)
Hover:       no border-glow change (this card is the anchor — it doesn't react)
```

#### Why this beats the current OverviewCard

- The number is **bigger** and uses Fraunces' optical-size axis — at 64px Fraunces is gorgeous, sober, and fundamentally not a wallet font.
- Actions live in a vertical stack on the right, NOT a 3-up grid below the number. This makes Send Private *visually dominant* (it's the top button, gold, with a star indicator that this is the differentiated action).
- The Æ watermark says "this is a treasury" without writing the word "treasury".
- The "show details" disclosure becomes a hover/click on the small SOL/USDC line — the breakdown drawer slides in below as a horizontal pill row, not a stacked table. Power users can keep it open via a `localStorage` toggle.

#### Actions stack — final

```
Send Private   [bg-accent, accent-ink, 14px, lock icon, ⌘S hint right]   ← primary
Deposit        [outline, ink, 13px, arrow-down-to-line icon]
Swap           [outline, ink, 13px, arrow-left-right icon]
More ⋯        [ghost, ink-muted, 13px → opens popover with: Add Sub-vault,
                                                                Recurring, Payroll,
                                                                Send Public]
```

The "More" popover is critical: it lets us hide non-everyday actions without nuking them. Today's BottomNav-style 3-up grid was forcing us to choose three actions — that's not enough for a treasury app.

### 4.2 — KPI ribbon (replaces TreasuryFlowStrip)

The three-equal-cards is the strongest AI-slop signal on the page. Asymmetric fix:

```
[ Inflow 30d ] [ Outflow 30d ] [ ============ Privacy Share 30d ============ ]
   3 cols          3 cols                       6 cols (DOUBLE)

Inflow / Outflow card (col 1 + 2):
  - 132px tall, padding 16px 18px
  - Eyebrow: "INFLOW · LAST 30 DAYS" (italic Fraunces section label)
  - Value: Fraunces 28px tabular, +12.4 SOL or -8.2 SOL
  - Sub: Geist Mono "≈ $1,240" + delta pill
  - Sparkline takes bottom 40px, accent-muted fill (no gradient — flat shade)

Privacy Share card (col 3, 6-cols wide):
  - 132px tall, padding 18px 22px
  - Left half:
    Eyebrow: "PRIVACY SHARE · LAST 30 DAYS"
    Big number: Fraunces 40px tabular accent — "78%"
    Sub: "12 private · 4 public · ≈ $32,400 shielded"
  - Right half:
    A horizontal segmented bar 8px tall (private = gold, public = subtle)
    Below: a privacy halo — 3 concentric arcs at 1px/2px/3px stroke pulsing
            at 4s ease-in-out, gold at 12% / 8% / 4% opacity
            ⇒ this is the "halo" — the only decorative motion in the app
            ⇒ owns the privacy idea visually
  - Click anywhere: opens PrivacyFlowModal with breakdown
```

The width imbalance is the message: **privacy is the headline KPI, not the third one**.

### 4.3 — Governance ribbon (replaces Governance / Cloak split)

Cloak is gone (now in sidebar + KPI). Governance shrinks to a single row:

```
[ ─────────────────────────────────────────────────────────────────── ]
[ Æ  GOVERNANCE          2-of-3 · 4 members · 12h timelock         →  ]
[                        with [identicon dots] for members            ]
[ ─────────────────────────────────────────────────────────────────── ]
- 72px tall, padding 16px 22px
- Æ on left in EB Garamond, 22px, accent (acts as visual anchor)
- Reference data, ledger-style, monospace numbers
- Member identicons inline (4 small 16px squares overlapping by 6px)
- Right arrow → /members page
- bg-surface, no hover-glow (this is reference, not interactive data)
```

This earns 1/4 of the row count of today's split block and reads as "the constitution of this vault" rather than "another card."

### 4.4 — Pending Proposals (no longer disappears)

```
┌─────────────────────────────────────────────────────────┐
│ 3  PENDING PROPOSALS              View all →            │
├─────────────────────────────────────────────────────────┤
│ #42  Send 4.2 SOL to Alice…       ●●○  2/3              │
│ #41  Payroll · 8 recipients       ●●●  3/3 ← ready      │
│ #40  Swap 200 USDC → SOL          ●○○  1/3              │
└─────────────────────────────────────────────────────────┘

Empty state (no pending):
┌─────────────────────────────────────────────────────────┐
│ ─── PROPOSAL QUEUE                                      │
│                                                         │
│      No proposals awaiting signatures                   │
│      [ New transaction ]  ← outline button, accent text │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Specs to apply across both:
- Approval dots: 6×6px, 2px gap, gold filled, ink-subtle/30 unfilled
- Row hover: bg-surface-2, NO border change (we're inside a card)
- "ready" badge appears at threshold: pill 9px font, gold soft bg, gold text
- Add a "From Sub-vault X" pill *only* when source != primary (already done — keep)

### 4.5 — Recent Activity

Today: 7-col layout per row (icon, type+#, address, amount, status, time, arrow). Too dense for a sidebar-flanked column.

Redesign:
- Move to right column at 4-col (narrower).
- Compact rows: icon + 1 line label + 1 line meta. Amount stacks below address with small delta.
- Ditch the trailing arrow (rows are already clickable; arrow appearing on hover only is fine).
- Add a 30s polling indicator (subtle pulse on the eyebrow dot) so it feels live.

### 4.6 — Skeleton

The current skeleton uses `shimmer-bg` already — keep, but match the new heights (240/132/72/auto/auto) and use 24px radius for hero, 16px for KPIs, 12px for ribbons.

---

## 5 · Card system (the rulebook)

We need 4 card archetypes. Today everyone uses one. That's the root cause of the "stack of containers" feel.

| Archetype | When | Radius | Padding | Border | Hover | Shadow |
|---|---|---|---|---|---|---|
| **Hero**  | Treasury balance, marquee data | 24px | 28px / 32px | 1px border/70 + 1px inset top highlight | none (anchor card) | raise-2 |
| **Panel** | KPIs, governance ribbon, segmented info | 16px | 18px / 22px | 1px border/60 | border lifts to border-strong, no glow | raise-1 |
| **List**  | Pending proposals, activity, sub-vault rows, members | 12px (panel) / 8px (rows) | 12px / 16px | 1px border/50 around panel, none on rows | row hover bg-surface-2 only | raise-1 panel |
| **Modal** | Send / Receive / Swap / Privacy flow | 28px | 32px header, 24px body, 20px footer | 1px border/60 + 1px inset top highlight | n/a | raise-2 + 24px backdrop blur |

Rules:
- **Hero is unique on the page** (only 1 hero card per route).
- **Panels are the workhorse** — KPI strip, governance, sub-vault detail.
- **Lists never nest panels.** A list IS a panel; rows are inside.
- **Modals get the inset highlight + watermark Æ** — they're the "we're about to move money" surface.

Anti-rules (delete on sight):
- ❌ `hover:border-accent/15` or `hover:border-accent/20` on every card. Replace with `hover:border-border-strong`. Gold border = active, not hovered.
- ❌ `transition-colors duration-200` without easing. Replace with `transition-aegis` (the existing custom easing curve in globals.css that's barely used).
- ❌ `rounded-2xl` everywhere. Use the table above.
- ❌ Adding a Card-with-`<CardHeader>` for a row in a list. Lists own their padding.

### 5.1 — Æ inset watermark (the brand moment)

Hero + Modals get the Æ watermark. Implement as a single component:

```tsx
// components/brand/HeraldicWatermark.tsx
export function HeraldicWatermark({ size = 360, opacity = 0.04 }: { size?: number; opacity?: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-12 -right-12 select-none font-garamond font-semibold text-accent"
      style={{ fontSize: size, lineHeight: 1, letterSpacing: "-0.02em", opacity }}
    >
      Æ
    </span>
  );
}
```

Used inside hero cards and modals. **Never on KPI panels** (would be busy).

---

## 6 · Modal redesign

Today's `Dialog` is a competent shadcn-dark modal. To make it Aegis we apply 4 changes:

1. **Header ribbon**: a 4px-tall horizontal gold gradient strip at the very top edge of the modal (`from-accent/0 via-accent to-accent/0`). Soft. Reads as a "seal."
2. **Heraldic watermark**: Æ in EB Garamond at 280px, accent at 3% opacity, bottom-right.
3. **Receipt-style detail rows**: amounts/addresses inside modals always render as
   ```
   Amount     ················ 4.2000 SOL
   To         ················ 7uX1…9pNk
   Memo       ················ Q4 contributor payout
   Network fee ··············· 0.000005 SOL
   ```
   Two columns: label left (Inter 12px ink-subtle), value right (Geist Mono 13px ink, tabular). The dotted-leader pattern is editorial and signals "this is a final, signed receipt." (Generated with `border-b border-dotted border-border` on a flex spacer.)
4. **Footer button order**: `[Cancel ghost] [Confirm gold]` always — never inverse. Confirm gets `min-w-[120px]` and includes the action verb ("Send 4.2 SOL", not "Confirm").

Modal sizes: keep `sm/md/lg/xl`. Add `xl` for the PrivacyFlowModal (it already needs the room).

Send modal specifically gets a **"Privacy Mode" toggle** at the top — Public / Shielded — that visually shifts the modal's accent intensity (Public = ink-muted accent, Shielded = full gold + halo arc). Today the Send modal doesn't differentiate; this is the moat.

---

## 7 · Topbar redesign

Today: balance pill (`$X.XX` tooltip → SOL/USDC), Inbox button (with count), Wallet menu.

Issues:
- Balance pill duplicates the Hero card's number.
- Inbox button is a 3-character border-pill that competes with the wallet menu.
- No global search.

Redesign:

```
[ ────────────────────────────────────────────────────────────── ]
[  ⌘K Search                            Network · ⊚ Inbox  Wallet ]
[ ────────────────────────────────────────────────────────────── ]
- Left: command palette trigger (⌘K) — replaces the balance pill
        (balance is now in Hero + Sidebar Vault Crest, twice is enough)
- Network chip: existing `network-status-chip` component, slightly de-emphasized
- ⊚ Inbox: same icon button, but the count badge moves up-right and uses a 9px gold pill
- Wallet menu: existing component, no change

bg-surface/[0.6] backdrop-blur-xl  (keep — backdrop-blur is justified here)
border-b border-white/[0.04]      (keep)
```

The command palette being top-left is the Linear pattern. Power users live in `⌘K`.

---

## 8 · Token + component diffs

### 8.1 — `globals.css` additions

```css
@layer base {
  :root {
    /* Add a brighter content surface so sidebar (bg-bg) can recede */
    --surface-content: 220 12% 11%;   /* between current surface (9%) and surface-2 (12%) */

    /* Inset highlight for hero/modal cards */
    --inset-highlight: 240 5% 96% / 0.04;

    /* Brass strip — for active sidebar rail */
    --brass: 39 56% 67%;              /* lighter than accent, for the embossed feel */
  }
}

@layer components {
  /* Replaces ad-hoc per-card hover transitions */
  .card-hero {
    @apply relative overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-raise-2;
    box-shadow:
      0 1px 0 0 hsl(var(--inset-highlight)) inset,
      0 1px 0 0 hsl(var(--border)),
      0 18px 48px -20px rgb(0 0 0 / 0.7);
  }
  .card-panel {
    @apply rounded-[16px] border border-border/60 bg-surface shadow-raise-1 transition-aegis;
  }
  .card-panel:hover { border-color: hsl(var(--border-strong)); }
  .card-list {
    @apply rounded-[12px] border border-border/50 bg-surface;
  }

  /* The privacy halo — used on the privacy KPI, never elsewhere */
  .privacy-halo {
    position: relative;
  }
  .privacy-halo::before,
  .privacy-halo::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid hsl(var(--accent) / 0.12);
    pointer-events: none;
    animation: halo-pulse 4s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }
  .privacy-halo::after {
    animation-delay: 2s;
    border-color: hsl(var(--accent) / 0.06);
  }
  @keyframes halo-pulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50%      { transform: scale(1.04); opacity: 0; }
  }

  /* Editorial section label — italic Fraunces small caps feel */
  .label-editorial {
    @apply font-display italic text-[11px] tracking-eyebrow text-ink-subtle/60;
  }

  /* Dotted-leader receipt row */
  .receipt-row {
    @apply flex items-baseline gap-2 py-1.5;
  }
  .receipt-row > .leader {
    @apply flex-1 border-b border-dotted border-border/60;
    transform: translateY(-3px);
  }
}
```

### 8.2 — `tailwind.config.ts` additions

```ts
extend: {
  colors: {
    surface: {
      DEFAULT: "hsl(var(--surface) / <alpha-value>)",
      content: "hsl(var(--surface-content) / <alpha-value>)",  // NEW
      2: "hsl(var(--surface-2) / <alpha-value>)",
      3: "hsl(var(--surface-3) / <alpha-value>)",
    },
    accent: {
      DEFAULT: "hsl(var(--accent) / <alpha-value>)",
      hover:   "hsl(var(--accent-hover) / <alpha-value>)",
      soft:    "hsl(var(--accent-soft) / <alpha-value>)",
      ink:     "hsl(var(--accent-ink) / <alpha-value>)",
      brass:   "hsl(var(--brass) / <alpha-value>)",            // NEW
    },
  },
  fontSize: {
    "hero-balance": ["clamp(3rem, 7vw, 4.5rem)", { lineHeight: "1.0", letterSpacing: "-0.025em" }],
    "kpi-value":   ["1.75rem", { lineHeight: "1.05", letterSpacing: "-0.018em" }],     // 28px
    "kpi-headline": ["2.5rem", { lineHeight: "1.0",   letterSpacing: "-0.022em" }],    // 40px (privacy)
  },
  borderRadius: {
    /* keep existing */
    hero:  "24px",
    panel: "16px",
    list:  "12px",
    modal: "28px",
  },
}
```

### 8.3 — Migration map per file

| File | Change |
|---|---|
| `apps/web/components/app/AppShell.tsx` | Sidebar bg from `bg-surface/[0.5] backdrop-blur-xl` → `bg-bg border-r border-border/40`. Main `<main>` gets a left bg shift to surface-content. Add Send Private CTA block. Replace Cloak banner with privacy meter strip. Remove "Help & Docs" placeholder. |
| `apps/web/components/app/VaultSelector.tsx` | Drop the green Check pip. Drop the LogOut hover-icon (move to dropdown). Add USD + SOL balance line beneath name. Add gold-tinted Æ watermark behind the identicon. |
| `apps/web/components/vault/OverviewCard.tsx` | Rewrite as TreasuryHeroCard with `card-hero` class, Æ watermark, vertical actions stack on right, primary "Send Private" with star indicator, "More" popover for secondary actions. |
| `apps/web/components/vault/TreasuryFlowStrip.tsx` | Asymmetric grid `lg:grid-cols-12`: Inflow `col-span-3`, Outflow `col-span-3`, Privacy `col-span-6`. Privacy panel adds the `privacy-halo` decorator + segmented bar. |
| `apps/web/components/app/VaultDashboard.tsx` | Drop the dual Governance/Cloak block. Replace with single 72px GovernanceRibbon (member identicons inline). Remove the duplicate Æ watermark on identicon row (it lives inside the hero now). Tighten skeleton. |
| `apps/web/components/vault/PendingProposalsCard.tsx` | Add empty-state branch (don't return null — show zero card with "New transaction" CTA). Adopt `label-editorial` for "PROPOSAL QUEUE." |
| `apps/web/components/vault/RecentActivityCard.tsx` | Adopt `card-list` styling. Compact rows for narrow column. Remove trailing arrow column (rows clickable). |
| `apps/web/components/ui/dialog.tsx` | Add 4px gold gradient ribbon at top edge. Optional `<HeraldicWatermark />` slot. New `ReceiptRow` sub-component. |
| `apps/web/components/vault/SendModal.tsx` | Add Public ↔ Shielded toggle with halo intensity shift. Use ReceiptRow for amount/recipient/fee/memo. |
| `apps/web/components/brand/HeraldicWatermark.tsx` (new) | Single source for Æ watermark. |
| `apps/web/components/site/CommandPaletteTrigger.tsx` (new) | Replace the topbar balance pill. |

---

## 9 · Motion spec

The current code uses `framer-motion` in dialogs and `transition-colors duration-200` everywhere else. Tighten it.

| Surface | Enter | Exit | Easing |
|---|---|---|---|
| Modal | 220ms scale 0.96→1 + 8px ↑ | 160ms reverse | `aegis` |
| Dialog backdrop | 200ms opacity | 150ms | linear |
| Sidebar drawer (mobile) | 280ms x-translate | 200ms | `aegis` |
| Card hover (border lift) | 160ms | 200ms | `aegis` |
| Skeleton → loaded | 280ms cross-fade | n/a | linear |
| Sparkline mount | 600ms stroke-dasharray | n/a | `aegis` |
| Privacy halo pulse | 4000ms loop | n/a | `aegis` |
| Number transitions (NumberFlow) | 400ms (current) | n/a | already aegis-cubic |
| Toast | 240ms slide+fade in, 180ms out | linear-ish | already shadcn |

Rules:
- Entry > exit always. Enforce.
- No bounce. No spring with `stiffness < 200`.
- One decorative motion in the whole product: the privacy halo pulse. Anything else is functional.

---

## 10 · Rollout plan

I'd ship in 4 vertical slices, each independently shippable. Total ~3-4 days of focused work.

### Sprint A — Foundation (½ day)
- Add tokens: `--surface-content`, `--inset-highlight`, `--brass`.
- Add utility classes: `card-hero`, `card-panel`, `card-list`, `label-editorial`, `privacy-halo`, `receipt-row`.
- Create `<HeraldicWatermark />`.
- No visual change yet — pure groundwork.

### Sprint B — Sidebar + AppShell (1 day)
- New surfaces (sidebar = bg-bg, main = surface-content).
- Vault Crest card with watermark + balance line.
- Inline "Send Private" CTA.
- Privacy meter strip (replacing Cloak banner).
- Editorial italic section labels.
- Topbar: command palette trigger replaces balance pill.

This sprint changes the *frame* of every page. Highest visible impact.

### Sprint C — Dashboard hero + KPI ribbon (1 day)
- TreasuryHeroCard rewrite (Fraunces 64px, vertical actions, watermark, "More" popover).
- TreasuryFlowStrip → asymmetric 3/3/6 grid + privacy halo.
- GovernanceRibbon (replaces split block).
- Pending Proposals empty state.
- Recent Activity narrower column.

This is the "wow" sprint — ship a screenshot for Twitter the night this lands.

### Sprint D — Modals + cascade (1 day)
- Dialog gold ribbon + watermark slot + ReceiptRow.
- SendModal Public/Shielded toggle.
- Apply card archetypes across `/proposals`, `/payroll`, `/swap`, `/audit`, `/sub-vaults`, `/members` (mostly mechanical class swaps once archetypes exist).
- Update skeleton heights/radii to match.
- Anti-slop sweep: grep for `rounded-2xl` and `hover:border-accent/15` site-wide; replace per the rulebook.

### Sprint E (optional) — Marketing alignment
- Same tokens land on `/` landing and `/audit/[id]` public export pages so the brand reads coherently from marketing → app → audit receipt.

---

## 11 · Anti-slop verification (do before each sprint merge)

Run this checklist on the diff:

- [ ] No `transition-all` or `transition-colors duration-200` *without* an easing curve. Use `transition-aegis`.
- [ ] No `hover:border-accent/15` or `/20` on cards. Hover lifts to `border-strong`, never gold.
- [ ] Hero card is unique on the page; no other element uses `card-hero`.
- [ ] No three identical cards in a row. KPI ribbon uses 3/3/6 split.
- [ ] No glassmorphism on cards. Backdrop-blur only on sticky chrome.
- [ ] No second accent color introduced. Greens/reds reserved for `signal-positive`/`signal-danger` semantic states only.
- [ ] All on-chain values use `font-mono tabular-nums`.
- [ ] All section labels use `label-editorial` (italic Fraunces) — not Inter uppercase.
- [ ] At least one editorial moment per page (Æ monogram, italic eyebrow, or large Fraunces number).
- [ ] Spacing rule: hero pads 28-32px; panel pads 18-22px; list rows 12-16px. Don't mix.

If 3+ items fail → reopen the diff. If 1-2 → judgment call by you.

---

## 12 · Why this works

- **It commits.** We had a heraldic seed and were under-using it. Every component now has a job *and* an editorial moment.
- **It differentiates.** Squads is light + warm fintech, Mercury is muted dark + Arcadia, Phantom is friendly Soft Consumer. Nobody else in crypto fintech runs Fraunces + EB Garamond + heraldic Æ watermarks. We will be visually instantly recognizable.
- **It earns the privacy moat.** The KPI ribbon's 6-col privacy panel + halo + sidebar privacy meter together make "% shielded" the loudest concept in the app. This is the only metric Squads cannot show. Visual real estate matches strategic value.
- **It's incremental.** No rip-and-replace. Tokens land first, components migrate sprint by sprint, anti-slop checklist guards regression.
- **It's mechanical to verify.** §11 is a grep-and-eyeball checklist.

---

## 13 · Open questions for you

1. **"Send Private" as the only gold sidebar CTA** — agree? Or do we need a "Quick Send" that prompts public-vs-private at the top? (My take: gold = shielded by default. The product opinion of Aegis.)
2. **Light theme** — out of scope here (Aegis is dark-native). Do you want me to spec a parallel light theme later, or is dark-only the brand position?
3. **Æ watermark on the OverviewCard hero** — visible always or only on the dashboard? My recommendation is dashboard-only; sub-pages get the watermark on their respective hero cards (e.g. `/proposals` hero = "PROPOSAL QUEUE").
4. **Privacy halo pulse** — 4s loop is calm. Some users may find ANY motion distracting. Honor `prefers-reduced-motion` (already wired in `globals.css`) and let it freeze for those users — agreed?
5. **Sidebar width** — keep 288 (`w-72`) or move to Linear's 256? My recommendation: 256 desktop with optional hover-expand to 288. More content space matters on a treasury app.

Once you sign off on those 5, I can start Sprint A.
