import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const EXPECTED_PUBKEY = "QqibVKumHaJAC5bYii7q2QRWf3faYTEj8ff1d6gqST5";
const OUT = path.join(homedir(), ".config/solana/cloak-devnet.json");

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });

function askHidden(question) {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch) => {
      if (ch === "\n" || ch === "\r" || ch === "") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stderr.write("\n");
        resolve(value);
      } else if (ch === "") {
        process.exit(130);
      } else if (ch === "") {
        if (value.length > 0) value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const raw = (await askHidden("Cole a private key do Phantom (base58, não aparece): ")).trim();
rl.close();

if (!raw) {
  console.error("Vazio. Abortado.");
  process.exit(1);
}

let bytes;
try {
  bytes = bs58.default?.decode ? bs58.default.decode(raw) : bs58.decode(raw);
} catch (e) {
  console.error("Falha ao decodificar base58:", e.message);
  console.error("Tem certeza que copiou a chave inteira, sem espaços?");
  process.exit(1);
}

let keypair;
if (bytes.length === 64) {
  keypair = Keypair.fromSecretKey(bytes);
} else if (bytes.length === 32) {
  keypair = Keypair.fromSeed(bytes);
} else {
  console.error(`Tamanho inesperado: ${bytes.length} bytes. Esperado 32 (seed) ou 64 (secretKey).`);
  process.exit(1);
}

const actualPubkey = keypair.publicKey.toBase58();
if (actualPubkey !== EXPECTED_PUBKEY) {
  console.error("ERRO: pubkey não bate.");
  console.error(`  Chave importada gera: ${actualPubkey}`);
  console.error(`  Esperado:            ${EXPECTED_PUBKEY}`);
  console.error("Não gravando arquivo. Confere se copiou a chave da wallet certa.");
  process.exit(1);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
console.log(`OK. Keypair gravado em ${OUT}`);
console.log(`Pubkey: ${actualPubkey}`);
