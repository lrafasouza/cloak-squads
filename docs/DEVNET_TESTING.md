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

## Opção 3: Encontrar suas multisigs

```bash
cd ~/cloak-squads
npx tsx scripts/find-existing-multisigs.ts [SUA_WALLET_PUBLIC_KEY]
```

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
