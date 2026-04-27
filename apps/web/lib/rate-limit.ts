const map = new Map<string, { count: number; reset: number }>();

export function checkRateLimit(
  ip: string,
  limit = 10,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const existing = map.get(ip);

  if (!existing || now > existing.reset) {
    map.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }

  if (existing.count >= limit) return false;

  existing.count++;
  return true;
}
