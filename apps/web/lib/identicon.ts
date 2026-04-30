/**
 * Deterministic identicon generator for Aegis vault avatars.
 * Takes any seed string (vault name, pubkey, createKey) and produces
 * an SVG data URL with a unique geometric pattern.
 *
 * Pure client-side, no dependencies beyond the Web Crypto API.
 */

const PALETTE = [
  "#C9A86A", // burnished gold (accent)
  "#7FB069", // signal-positive green
  "#6A8EC9", // slate blue
  "#C96A6A", // muted red
  "#9B6AC9", // violet
  "#6AC9C0", // teal
  "#C9A06A", // amber
];

function hashSeed(seed: string): Uint8Array {
  const bytes = new TextEncoder().encode(seed);
  const result = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    result[i % 32]! ^= bytes[i]!;
    result[(i + 1) % 32] = ((result[(i + 1) % 32]! + bytes[i]! * 31) & 0xff);
  }
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 32; i++) {
      result[i] = ((result[i]! ^ result[(i + 7) % 32]! ^ (round * 17)) & 0xff);
    }
  }
  return result;
}

export function generateIdenticon(seed: string, size = 40): string {
  const hash = hashSeed(seed || "aegis-default");

  const color = PALETTE[hash[0]! % PALETTE.length]!;
  const bgHue = (hash[1]! * 360) / 256;
  const bg = `hsl(${bgHue},12%,10%)`;

  const cells = 5;
  const cellSize = size / cells;
  const grid: boolean[] = [];

  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < Math.ceil(cells / 2); col++) {
      const idx = row * Math.ceil(cells / 2) + col;
      const filled = (hash[idx % 32]! & 1) === 1;
      grid[row * cells + col] = filled;
      grid[row * cells + (cells - 1 - col)] = filled;
    }
  }

  const rects = grid
    .map((filled, i) => {
      if (!filled) return "";
      const col = i % cells;
      const row = Math.floor(i / cells);
      const x = col * cellSize;
      const y = row * cellSize;
      return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="1" fill="${color}" opacity="0.9"/>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

