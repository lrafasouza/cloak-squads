export type ExecutionHistoryItem = {
  id: string;
  transactionIndex: string;
  type: "single" | "payroll";
  recipient?: string;
  recipientCount?: number;
  amount: string;
  status: "success" | "error";
  signature?: string;
  cloakSignature?: string;
  withdrawSignature?: string;
  error?: string;
  createdAt: string;
};

function executionHistoryKey(multisig: string) {
  return `operator-execution-history:${multisig}`;
}

function executedMapKey(multisig: string) {
  return `aegis:operator-executed-map:${multisig}`;
}

export function readExecutionHistory(multisig: string): ExecutionHistoryItem[] {
  try {
    const key = executionHistoryKey(multisig);
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ExecutionHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function writeExecutionHistory(multisig: string, items: ExecutionHistoryItem[]) {
  try {
    localStorage.setItem(executionHistoryKey(multisig), JSON.stringify(items.slice(0, 20)));
  } catch {
    // Best effort browser-local execution history.
  }
}

export function markProposalExecuted(multisig: string, transactionIndex: string) {
  try {
    const key = executedMapKey(multisig);
    const raw = localStorage.getItem(key);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[transactionIndex] = true;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Best effort.
  }
}

export function isProposalExecuted(
  multisig: string,
  transactionIndex: string,
): boolean {
  try {
    const key = executedMapKey(multisig);
    const raw = localStorage.getItem(key);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, boolean>;
      if (map[transactionIndex]) return true;
    }
  } catch {
    // ignore
  }

  const history = readExecutionHistory(multisig);
  return history.some(
    (item) => item.transactionIndex === transactionIndex && item.status === "success",
  );
}
