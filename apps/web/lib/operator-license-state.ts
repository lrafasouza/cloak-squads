export type ProposalStatus =
  | "draft"
  | "active"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "cancelled"
  | "other"
  | "unknown"
  | "loading"
  | "error";

export type OperatorLicenseStatus =
  | "idle"
  | "loading"
  | "missing"
  | "active"
  | "consumed"
  | "expired"
  | "error";

export type OperatorExecutionBlockReason =
  | "ready"
  | "no-draft"
  | "wallet-disconnected"
  | "wrong-operator"
  | "cofre-missing"
  | "low-operator-sol"
  | "proposal-not-approved"
  | "execute-vault-transaction"
  | "license-loading"
  | "license-consumed"
  | "license-expired"
  | "license-error";

export function normalizeLicenseStatus(
  status: unknown,
  expiresAtUnix: number | null,
  nowUnix: number,
): OperatorLicenseStatus {
  const variant = readAnchorEnumVariant(status);
  if (variant === "consumed") return "consumed";
  if (variant !== "active") return "error";
  if (expiresAtUnix !== null && expiresAtUnix < nowUnix) return "expired";
  return "active";
}

export function getOperatorExecutionState(input: {
  hasDraft: boolean;
  walletConnected: boolean;
  operatorMismatch: boolean;
  cofreMissing: boolean;
  lowOperatorSol: boolean;
  proposalStatus: ProposalStatus;
  licenseStatus: OperatorLicenseStatus;
}): { canExecute: boolean; reason: OperatorExecutionBlockReason } {
  if (!input.hasDraft) return { canExecute: false, reason: "no-draft" };
  if (!input.walletConnected) return { canExecute: false, reason: "wallet-disconnected" };
  if (input.operatorMismatch) return { canExecute: false, reason: "wrong-operator" };
  if (input.cofreMissing) return { canExecute: false, reason: "cofre-missing" };
  if (input.lowOperatorSol) return { canExecute: false, reason: "low-operator-sol" };

  if (input.licenseStatus === "active") return { canExecute: true, reason: "ready" };
  if (input.licenseStatus === "loading" || input.licenseStatus === "idle") {
    return { canExecute: false, reason: "license-loading" };
  }
  if (input.licenseStatus === "consumed") {
    return { canExecute: false, reason: "license-consumed" };
  }
  if (input.licenseStatus === "expired") {
    return { canExecute: false, reason: "license-expired" };
  }
  if (input.licenseStatus === "missing") {
    return input.proposalStatus === "approved"
      ? { canExecute: false, reason: "execute-vault-transaction" }
      : { canExecute: false, reason: "proposal-not-approved" };
  }

  return { canExecute: false, reason: "license-error" };
}

function readAnchorEnumVariant(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = record.__kind;
  if (typeof kind === "string") return kind.toLowerCase();
  const firstKey = Object.keys(record)[0];
  return firstKey ? firstKey.toLowerCase() : null;
}
