# Multisigs de Exemplo no Devnet

Se você não tem uma multisig, pode usar uma destas opções:

## Opção 1: Criar uma nova (Recomendado)

```bash
# Com sua wallet configurada (~/.config/solana/id.json)
cd ~/cloak-squads
export SOLANA_KEYPAIR=~/.config/solana/id.json
npx tsx scripts/setup-demo-cofre.ts [SUA_WALLET_PUBLIC_KEY]
```

Isso vai criar uma multisig 1-of-1 e salvar os detalhes em `scripts/.demo-cofre.json`.

## Opção 2: Usar uma existente

Se você sabe o endereço de uma multisig, pode colar diretamente no campo "Multisig address" na página inicial.

## Opção 3: Criar pela landing page

Na landing page, conecte a wallet e use "Create a new multisig".

- `Members`: signers da Squads multisig. A wallet conectada entra automaticamente.
- `Approval threshold`: quantos membros precisam aprovar uma proposta.
- `Operator wallet`: wallet que executa licenses aprovadas em `/operator`.

Para `1-of-1`, deixe o operator como a wallet conectada. O app cria a multisig, cria a proposta `init_cofre`, aprova e tenta executar o bootstrap automaticamente.

Para `N-of-M`, o app cria a proposta `init_cofre`, mas os membros ainda precisam aprovar e executar essa proposta na Squads flow antes do operator conseguir executar private sends.

## Opção 4: Encontrar suas multisigs

```bash
cd ~/cloak-squads
npx tsx scripts/find-existing-multisigs.ts [SUA_WALLET_PUBLIC_KEY]
```

## Operator self-service no deploy Vercel

O deploy na Vercel não roda um processo persistente para executar proposals automaticamente. No modo hackathon, o operator é self-service:

1. O cofre registra uma `Operator wallet` no `init_cofre`.
2. Os membros aprovam a proposal na Squads multisig.
3. A wallet registrada como operator abre `/cofre/<multisig>/operator`.
4. O operator precisa ter SOL no devnet. A UI alerta quando o saldo está abaixo de `0.01 SOL`.
5. O botão `Execute` só libera quando a wallet conectada é o operator, a proposal está approved e existe saldo suficiente para pagar taxas.

## Dicas para Testar o F2 (Payroll)

1. Conecte sua wallet na página inicial
2. Cole o endereço da multisig e clique "Open cofre"
3. Vá para a aba "Payroll"
4. Use o CSV de exemplo: `scripts/test-payroll.csv`
5. Crie a proposta e aprove

## Troubleshooting

### "Scan memberships" quebra
- Foi corrigido na versão mais recente (commit 134f842)
- O RPC devnet pode estar lento ou com rate limit
- Use a entrada manual em vez do scan

### "NotAMember" error
- Sua wallet não é membro da multisig
- Use `setup-demo-cofre.ts` para criar uma onde você é membro

### Commitment mismatch
- Foi corrigido — o commitment agora é gerado deterministicamente
- Certifique-se de usar a versão mais recente do código
