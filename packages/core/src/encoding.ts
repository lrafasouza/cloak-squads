import { PublicKey } from "@solana/web3.js";

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function u64ToLeBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, n, true);
  return out;
}

export function pubkeyToBytes(pk: PublicKey | Uint8Array | string): Uint8Array {
  if (pk instanceof Uint8Array) return pk;
  if (typeof pk === "string") return new PublicKey(pk).toBytes();
  return pk.toBytes();
}

export function domainSeparator(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  const out = new Uint8Array(encoded.length + 1);
  out.set(encoded, 0);
  out[encoded.length] = 0;
  return out;
}

export function encodeI64(value: bigint): Uint8Array {
  return u64ToLeBytes(value);
}

export function encodePubkey(pk: PublicKey | Uint8Array | string): Uint8Array {
  return pubkeyToBytes(pk);
}

export function encodeArray(bytes: Uint8Array, length: number, label: string): Uint8Array {
  if (bytes.length !== length) {
    throw new Error(`${label} must be ${length} bytes, got ${bytes.length}`);
  }
  return bytes;
}

export function u32ToLeBytes(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value, true);
  return out;
}
