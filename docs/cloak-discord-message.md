# Discord message

## Mensagem 1 — manda essa primeiro

fala galera, to no hackathon do cloak track fazendo a integração Squads x Cloak e bater num blocker no sdk devnet

o `sdk.deposit()` manda discriminator 1 com 4 accounts, mas o programa devnet (`Zc1k...us27h`) ja nao aceita mais isso — retorna `0x1063` em ~112 CU, nem chega a validar account de verdade, o programa rejeita no dispatch do instruction tag

testei montando a ix na mao com discriminator 0 (`transact`), 7 accounts, e o programa aceitou o shape — so falhou em `0x1062` com proof lixo, que era esperado. entao o `transact` é o caminho vivo, mas o sdk nao roteia por ele

o problema é que `privateTransfer` e `withdraw` tambem chamam `deposit()` internamente, entao todos os flows publicos tavam quebrando

repro:
```ts
const sdk = new CloakSDK({ keypairBytes, network: "devnet", storage: new MemoryStorageAdapter() });
await sdk.deposit(connection, 50_000_000); // 0x1063
```

tem alguma versao mais nova do sdk ou eta de fix? se nao tiver, voces tem um exemplo de `transact` deposit-only com o layout de public inputs que o programa espera?

por enquanto to rodando com um mock nosso pro hackathon

---

## Mensagem 2 — manda essa se pedirem mais detalhe

entao, fui fundo pra ter certeza que era do sdk e nao nosso codigo

**o que testamos:**

1. `sdk.deposit()` → `0x1063` em 112 CU
2. `sdk.privateTransfer()` → mesma coisa, ele chama `this.deposit()` internamente na linha 3569 do bundle
3. `sdk.withdraw()` → mesma coisa, chama `privateTransfer` que chama `deposit`
4. montei a ix na mao com disc 1 variando 4/5/6 accounts (com e sem treasury, com e sem vaultAuthority) → todas `0x1063`, o discriminator 1 ta aposentado de vez
5. disc 0 com 7 accounts (payer, pool, treasury, merkleTree, 2 nullifierPDA, systemProgram) → `0x1062` em 140 CU, o programa aceitou o shape e rejeitou so no proof lixo

**no bundle do sdk (`dist/index.cjs`):**

- `createDepositInstruction` (linha 2589) → hardcodeia disc `[1]`, 4 accounts
- `buildTransactInstruction` (linha 6109) → usa disc `0`, 7 accounts com treasury e nullifiers — esse funciona
- `sdk.deposit()` (linha 3325) → chama o builder legacy incondicionalmente

ou seja o sdk ja tem o builder certo, so nao usa ele

**infra ta ok:**
- todas as PDAs do shield-pool tao inicializadas (SOL e mock USDC)
- programa ta deployado e executavel
- o gap é 100% client-side

**versoes:**
- `@cloak.dev/sdk-devnet` so tem uma versao no npm: `0.1.5-devnet.0`
- `@cloak.dev/sdk` ultima é `0.1.5` com o mesmo `createDepositInstruction` disc 1

nosso mock ta deployado em `2RSPX6Lha1nGy2To6ePkj2FD2KFG5rpzdxtiQqTKFRxe` (um programa stub que fizemos pra simular o comportamento do cloak real), o shape de CPI do gatekeeper foi validado em bankrun. trocamos pro cloak real assim que o sdk for corrigido

tenho scripts de repro no repo se quiserem
