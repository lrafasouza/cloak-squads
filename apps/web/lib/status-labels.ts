export type StatusKind =
  | "active"
  | "approved"
  | "executed"
  | "cancelled"
  | "rejected"
  | "draft"
  | "executing"
  | "ready"
  | "claimed"
  | "expired"
  | "voided"
  | "missing"
  | "loading"
  | "unknown";

export function statusLabel(status: StatusKind | string): { label: string; color: string } {
  switch (status) {
    case "active":
      return { label: "Aguardando aprovações", color: "text-amber-200" };
    case "approved":
      return { label: "Aprovada", color: "text-emerald-300" };
    case "executed":
      return { label: "Executada", color: "text-emerald-300" };
    case "cancelled":
      return { label: "Cancelada", color: "text-red-200" };
    case "rejected":
      return { label: "Rejeitada", color: "text-red-200" };
    case "draft":
      return { label: "Rascunho", color: "text-neutral-400" };
    case "executing":
      return { label: "Executando", color: "text-amber-200" };
    case "ready":
      return { label: "Pronta para resgate", color: "text-emerald-300" };
    case "claimed":
      return { label: "Resgatada", color: "text-blue-200" };
    case "expired":
      return { label: "Expirada", color: "text-red-200" };
    case "voided":
      return { label: "Anulada", color: "text-red-200" };
    case "missing":
      return { label: "Não encontrada", color: "text-red-200" };
    case "loading":
      return { label: "Carregando...", color: "text-neutral-400" };
    default:
      return { label: "Desconhecido", color: "text-neutral-400" };
  }
}

export function statusBadge(status: StatusKind | string): {
  label: string;
  bg: string;
  text: string;
} {
  switch (status) {
    case "active":
      return { label: "Pendente", bg: "bg-amber-900", text: "text-amber-200" };
    case "approved":
      return { label: "Aprovada", bg: "bg-emerald-900", text: "text-emerald-200" };
    case "executed":
      return { label: "Executada", bg: "bg-emerald-900", text: "text-emerald-200" };
    case "cancelled":
      return { label: "Cancelada", bg: "bg-red-900", text: "text-red-200" };
    case "rejected":
      return { label: "Rejeitada", bg: "bg-red-900", text: "text-red-200" };
    case "draft":
      return { label: "Rascunho", bg: "bg-neutral-800", text: "text-neutral-400" };
    case "executing":
      return { label: "Executando", bg: "bg-amber-900", text: "text-amber-200" };
    case "ready":
      return { label: "Pronta", bg: "bg-emerald-900", text: "text-emerald-200" };
    case "claimed":
      return { label: "Resgatada", bg: "bg-blue-900", text: "text-blue-200" };
    case "expired":
      return { label: "Expirada", bg: "bg-red-900", text: "text-red-200" };
    case "voided":
      return { label: "Anulada", bg: "bg-red-900", text: "text-red-200" };
    case "missing":
      return { label: "Não encontrada", bg: "bg-red-900", text: "text-red-200" };
    case "loading":
      return { label: "Carregando", bg: "bg-neutral-800", text: "text-neutral-400" };
    default:
      return { label: "Desconhecido", bg: "bg-neutral-800", text: "text-neutral-400" };
  }
}
