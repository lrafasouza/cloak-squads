export type ScopedAuditKey = {
  diversifier: Uint8Array;
};

export async function deriveScopedAuditKey(): Promise<never> {
  throw new Error("deriveScopedAuditKey: not yet wired — requires F3 audit integration with Cloak SDK");
}
