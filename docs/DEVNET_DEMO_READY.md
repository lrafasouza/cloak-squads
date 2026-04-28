# Devnet Demo Readiness Checklist

Pré-requisitos para uma demo estável do Cloak-Squads em Solana devnet. Não é mainnet planning — esta spec é devnet only.

## Antes da demo

### Env vars (ver `apps/web/lib/env.ts`)

- [ ] `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`
- [ ] `NEXT_PUBLIC_RPC_URL` — usar Helius/QuickNode/Triton devnet (NÃO `api.devnet.solana.com` — rate limit baixo)
- [ ] `NEXT_PUBLIC_CLOAK_PROGRAM_ID=Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h`
- [ ] `NEXT_PUBLIC_CLOAK_RELAY_URL=https://api.devnet.cloak.ag`
- [ ] `NEXT_PUBLIC_GATEKEEPER_PROGRAM_ID=AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq`
- [ ] `NEXT_PUBLIC_SQUADS_PROGRAM_ID=SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`
- [ ] `DATABASE_URL=file:./dev.db` (ou Postgres em prod)
- [ ] `JWT_SIGNING_SECRET` — string aleatória ≥32 bytes (NÃO usar default)
- [ ] `LOG_LEVEL=info`

### Infraestrutura

- [ ] `https://api.devnet.cloak.ag` responde — `curl -sf https://api.devnet.cloak.ag/range-quote -X POST -d '{}'`
- [ ] Solana devnet operacional — `solana cluster-version --url devnet`
- [ ] `pnpm install` corrido sem erros
- [ ] `pnpm prisma generate` (Prisma client está atualizado)
- [ ] `pnpm --filter web exec prisma migrate deploy` aplicada
- [ ] `pnpm seed:demo` corrido (gera cofre + drafts + audit links + stealth invoice)
- [ ] `.demo-data.json` existe na raiz

### Programas on-chain

- [ ] `cloak_gatekeeper` deployado em devnet — verificar `solana program show <PROGRAM_ID> --url devnet`
- [ ] ~~`cloak_mock` deployado em devnet~~ ❌ REMOVIDO

### Testes

- [ ] `pnpm test:int` passa (5 ficheiros bankrun)
- [ ] `pnpm test:unit` passa (1 ficheiro vitest)
- [ ] (opcional, custa SOL) `RUN_DEVNET_TESTS=1 pnpm test:devnet` passa

## Riscos conhecidos

### Devnet reset periódico

A Solana Foundation faz reset periódico da devnet. Sintoma: `getAccountInfo(cofrePda)` retorna `null`. Procedimento:

1. `pnpm seed:reset` (regenera DB + on-chain via `setup-demo-cofre.ts`)
2. Se gatekeeper foi wiped também: `pnpm deploy:gk -- --cluster devnet`
3. Atualizar `.demo-data.json` se necessário

### Cloak SDK quirks

- `sdk.deposit()` está broken — usar `cloakDeposit()` wrapper (`packages/core/src/cloak-deposit.ts`)
- Settlement delay de ~20s entre `transact()` e UI feedback (per docs.cloak.ag)
- Sanctions screening está desabilitada em devnet, mas relay continua mandatório

### Mock USDC

`DEVNET_MOCK_USDC_MINT` exportado pelo SDK. Disponível para futuras features de swap (Bloco 5+). Ainda não exposto na UI.

## Smoke test pré-demo

Run, em ordem:

```bash
pnpm install
pnpm prisma generate
pnpm test:all
pnpm seed:demo
pnpm dev   # http://localhost:3000
```

Click-through:

1. Open `/cofre/<multisigAddress>` (do `.demo-data.json`)
2. Verificar que aparecem 3 proposal drafts
3. Click em `/cofre/<multisigAddress>/audit` — listar 2 audit links
4. Click em `/cofre/<multisigAddress>/invoice` — criar nova stealth invoice
5. Open URL stealth gerada num browser separado — claim flow

Se algum passo falhar: ver logs de `pnpm dev` + verificar `.env.local`.
