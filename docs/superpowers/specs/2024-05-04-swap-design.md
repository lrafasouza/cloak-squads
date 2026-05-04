# Design: Card de Swap SOL → USDC via Jupiter (Devnet)

**Data:** 2024-05-04
**Autor:** Assistant
**Status:** Aprovado

---

## 1. Visão Geral

Adicionar um card de swap no QuickActionBar do vault para permitir que membros do Squads multisig proponham conversões SOL → USDC via Jupiter Exchange. O swap ocorre dentro do vault (o USDC resultante fica no vault) e utiliza a API REST do Jupiter para obter quotes e instruções de swap.

### Contexto
O Aegis é uma infraestrutura de privacidade para vaults Squads usando o protocolo Cloak. Atualmente o QuickActionBar possui 4 ações: Receive, Send, Invoice e Payroll. O swap será a 5ª ação.

### Objetivos
- Permitir que membros do vault proponham swap SOL → USDC
- Manter o padrão existente de propostas Squads (criar → aprovar → executar)
- Utilizar Jupiter API para roteamento e execução do swap
- Manter consistência visual com os modais existentes (SendModal)

### Escopo
**Incluído:**
- Card de Swap no QuickActionBar
- Modal de swap com input de SOL, preview de USDC, configuração de slippage
- Integração com Jupiter API (quote + swap instruction)
- Criação de proposta Squads com instruções de swap
- Transaction progress consistente com o existente

**Excluído:**
- Swap de outros pares (SOL → token, token → token)
- Swap privado via Cloak (nesta versão o swap é público)
- Integração com Jupiter Terminal (widget)
- Execução automática após aprovação

---

## 2. Arquitetura

### 2.1 Componentes

```
QuickActionBar
├── SwapModal (novo)
│   ├── SwapForm (input SOL, display quote)
│   ├── SlippageSelector (0.1%, 0.5%, 1%)
│   ├── QuotePreview (USDC a receber, rota, taxa)
│   └── TransactionProgress (reutilizar hook existente)
├── JupiterSwapService (novo)
│   ├── getQuote()
│   ├── getSwapInstructions()
│   └── buildSquadsSwapInstructions()
└── SwapActionButton (novo, no QuickActionBar)
```

### 2.2 Data Flow

```
Usuário clica "Swap" no QuickActionBar
    ↓
Abre SwapModal
    ↓
Usuário insere quantidade de SOL
    ↓
JupiterSwapService.getQuote(SOL, USDC, amount, slippage)
    ↓
Jupiter API /quote → retorna route + expectedOutput + priceImpact
    ↓
Display preview: "Você receberá ~X USDC"
    ↓
Usuário confirma
    ↓
JupiterSwapService.getSwapInstructions(quoteResponse, vaultPda)
    ↓
Jupiter API /swap-instruction → retorna instructions + addressLookupTables
    ↓
Adaptar instructions para Squads vault PDA (signer)
    ↓
createVaultProposal({ instructions: swapInstructions })
    ↓
Proposta criada no Squads → membros aprovam → executam
    ↓
Swap executado on-chain, USDC chega ao vault
```

### 2.3 Integração com Sistema Existente

O swap reutiliza os mesmos padrões do `SendModal`:
- `useTransactionProgress` para progresso da transação
- `createVaultProposal` do `squads-sdk.ts` para criar propostas
- `Dialog` e `DialogContent` do shadcn/ui para o modal
- Verificação de balance do vault antes de criar proposta

---

## 3. Detalhes Técnicos

### 3.1 Jupiter API (Devnet)

**Base URL:** `https://api.jup.ag/swap/v1/`

**Endpoints:**

1. **GET /quote**
   - Query params:
     - `inputMint`: `So11111111111111111111111111111111111111112` (SOL)
     - `outputMint`: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (USDC devnet)
     - `amount`: quantidade em lamports
     - `slippageBps`: slippage em basis points (50 = 0.5%)
     - `onlyDirectRoutes`: false (permite rotas indiretas)
   - Response: `QuoteResponse` com route, expectedOutput, priceImpact, etc.

2. **POST /swap**
   - Body:
     - `quoteResponse`: objeto retornado pelo /quote
     - `userPublicKey`: vault PDA (signer)
     - `wrapAndUnwrapSol`: true
     - `useSharedAccounts`: true
     - `prioritizationFeeLamports`: fee prioritária (opcional)
   - Response: `SwapResponse` com:
     - `swapTransaction`: string base64 (versão legacy) ou `VersionedTransaction` serialized
     - `addressLookupTableAddresses`: array de PublicKeys (para VersionedTransaction)
     - ` prioritizationFeeLamports`: fee usada

### 3.2 Adaptação para Squads Vault

O Jupiter retorna uma `VersionedTransaction` serializada (base64) no campo `swapTransaction`. Para usar com Squads, precisamos extrair as instructions da transação e criar uma proposta Squads com elas.

**Processo de adaptação:**

1. **Obter quote:** `GET /quote` com inputMint, outputMint, amount, slippageBps
2. **Obter swap transaction:** `POST /swap` com quoteResponse e userPublicKey = vaultPda
3. **Deserializar transação:** 
   ```typescript
   const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
   const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
   ```
4. **Extrair message:**
   ```typescript
   const message = transaction.message;
   const instructions = message.compiledInstructions;
   ```
5. **Mapear accounts:**
   - `message.staticAccountKeys` contém as contas estáticas
   - Para cada instruction, resolver os account indices para PublicKeys
6. **Criar TransactionInstructions:**
   ```typescript
   const swapInstructions = instructions.map(ix => {
     return new TransactionInstruction({
       programId: message.staticAccountKeys[ix.programIdIndex],
       keys: ix.accountKeyIndexes.map(idx => ({
         pubkey: message.staticAccountKeys[idx],
         isSigner: message.isAccountSigner(idx),
         isWritable: message.isAccountWritable(idx)
       })),
       data: Buffer.from(ix.data)
     });
   });
   ```
7. **Address Lookup Tables:**
   - Se `addressLookupTableAddresses` existir, precisamos resolver as contas dinâmicas
   - Buscar cada ALT on-chain para obter as contas
   - Mapear os indices das contas dinâmicas
8. **Criar proposta Squads:**
   ```typescript
   await createVaultProposal({
     connection,
     wallet,
     multisigPda,
     instructions: swapInstructions,
     addressLookupTableAccounts // se houver
   });
   ```

**Nota importante:** O vault PDA já é o `userPublicKey` passado para a Jupiter API, então as instruções já vêm configuradas com o vault como signer principal. Não é necessário substituir signers manualmente — o Squads vai usar o vault PDA como signer quando a proposta for executada.

### 3.3 Slippage Configuration

Padrão: 0.5% (50 bps)
Opções: 0.1% (10 bps), 0.5% (50 bps), 1% (100 bps)

### 3.4 Tratamento de Erros

- **Quote falhou**: mostrar erro "Não foi possível obter cotação. Tente novamente."
- **Slippage too high**: warning se priceImpact > 1%
- **Insufficient balance**: verificar balance SOL do vault antes de criar proposta
- **Swap instruction falhou**: erro genérico "Falha ao construir transação de swap"
- **Proposta falhou**: reutilizar tratamento existente do SendModal

---

## 4. UI/UX

### 4.1 QuickActionBar

Adicionar 5º card ao grid:
- **Ícone:** `ArrowLeftRight` (lucide-react)
- **Label:** "Swap"
- **Descrição:** "Swap tokens"
- **Variant:** "default" (igual Send/Receive)
- **Posição:** Depois de "Payroll" ou antes? (sugestão: entre Send e Invoice)

### 4.2 SwapModal

Layout similar ao SendModal:
- **Header:** "Swap SOL → USDC"
- **Input Section:**
  - Campo "From": Input de quantidade SOL + display de balance disponível
  - Botão "Max" para preencher balance total
  - Campo "To": Display readonly do quote USDC
  - Ícone de swap entre os campos
- **Slippage Selector:** Tabs ou dropdown (0.1%, 0.5%, 1%)
- **Quote Preview:**
  - "Você receberá: ~X USDC"
  - "Rota: SOL → USDC via [DEX]"
  - "Impacto de preço: X%"
  - "Taxa: X SOL"
- **Footer:** Botão "Create Swap Proposal" (desabilitado se sem quote ou balance insuficiente)
- **Info Box:** Explicação que cria uma proposta Squads

### 4.3 Estados

1. **Empty**: Modal aberto, inputs vazios, botão desabilitado
2. **Loading Quote**: Usuário digitou, buscando quote na Jupiter
3. **Quote Ready**: Preview exibido, botão habilitado
4. **Creating Proposal**: Transaction progress em andamento
5. **Success**: Proposta criada, modal fecha
6. **Error**: Mensagem de erro exibida

---

## 5. Dependências

### 5.1 Novas Dependências

Nenhuma! A integração é via API REST (fetch nativo), não requer SDK do Jupiter.

### 5.2 Dependências Existentes Reutilizadas

- `@solana/web3.js` — para PublicKey, TransactionInstruction, etc.
- `@sqds/multisig` — para criar propostas
- `lucide-react` — ícones (ArrowLeftRight)
- `@/components/ui/*` — componentes de UI (Dialog, Input, Button)
- `@/lib/squads-sdk.ts` — `createVaultProposal`
- `@/lib/tokens.ts` — `SOL_MINT`, utilitários de token

---

## 6. Testes

### 6.1 Unitários

- `JupiterSwapService.getQuote()` — mock da API, verificar parsing
- `JupiterSwapService.getSwapInstructions()` — mock, verificar adaptação para vault PDA
- `SwapModal` — renderização, estados, validação de input

### 6.2 Integração (Devnet)

1. Criar vault com SOL
2. Abrir modal de swap
3. Inserir 0.01 SOL
4. Verificar quote retornado
5. Criar proposta
6. Aprovar proposta
7. Executar proposta
8. Verificar se USDC chegou ao vault

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Jupiter API indisponível | Média | Alto | Timeout de 10s, retry 1x, mensagem de erro clara |
| Slippage alto durante execução | Média | Alto | Default 0.5%, warning se >1%, usar prioritization fee |
| Vault não tem SOL suficiente | Alta | Médio | Verificar balance antes de criar proposta |
| Quote expirado antes da execução | Baixa | Médio | Quotes são válidos por ~60s, aceitável para propostas |
| Incompatibilidade com Squads vault PDA | Baixa | Alto | Testar adaptação das instructions com cuidado |

---

## 8. Próximos Passos

1. Implementar `JupiterSwapService`
2. Implementar `SwapModal` component
3. Adicionar card ao `QuickActionBar`
4. Testar fluxo end-to-end na devnet
5. Documentar no README

---

## 9. Referências

- [Jupiter API Docs](https://station.jup.ag/docs/apis/quote-api)
- [Jupiter Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Squads SDK Docs](https://docs.squads.so/sdk/)
- `SendModal.tsx` — referência para padrão de modal + proposta
- `QuickActionBar.tsx` — referência para adicionar nova ação
- `lib/squads-sdk.ts` — referência para criar propostas

---

## 10. Changelog

- **v1.0** (2024-05-04): Design inicial aprovado
