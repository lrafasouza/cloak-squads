import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export function WorkspacePage({ children, className }: HTMLAttributes<HTMLElement>) {
  return (
    <main className={cn("min-h-screen bg-bg", className)}>
      <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</section>
    </main>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        {eyebrow ? <div className="text-eyebrow text-accent">{eyebrow}</div> : null}
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Panel({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-subtle">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function DetailRow({
  label,
  value,
  mono,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1", className)}>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-subtle">{label}</dt>
      <dd
        className={cn(
          "rounded-md border border-border bg-bg/50 px-3 py-2 text-sm text-ink",
          mono && "break-all font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function InlineAlert({
  tone = "warning",
  children,
  className,
}: {
  tone?: "warning" | "danger" | "success" | "info";
  children: ReactNode;
  className?: string;
}) {
  const dotColor = {
    warning: "bg-signal-warn",
    danger: "bg-signal-danger",
    success: "bg-signal-positive",
    info: "bg-ink-subtle",
  }[tone];

  const textColor = {
    warning: "text-signal-warn",
    danger: "text-signal-danger",
    success: "text-signal-positive",
    info: "text-ink-muted",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm",
        textColor,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor)} />
      {children}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success" | "danger" | "accent";
  className?: string;
}) {
  const dotColor = {
    neutral: "bg-ink-subtle",
    warning: "bg-signal-warn",
    success: "bg-signal-positive",
    danger: "bg-signal-danger",
    accent: "bg-accent",
  }[tone];

  const textColor = {
    neutral: "text-ink-muted",
    warning: "text-ink",
    success: "text-ink",
    danger: "text-ink",
    accent: "text-ink",
  }[tone];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", textColor, className)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
      {children}
    </span>
  );
}

export function EmptyPanel({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-bg/30 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
