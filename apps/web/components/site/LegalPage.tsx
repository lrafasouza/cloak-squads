import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Eyebrow } from "@/components/ui/aegis";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <SiteHeader showWallet={false} />

      <article className="mx-auto max-w-3xl px-4 pt-16 pb-24 md:px-6 md:pt-28 md:pb-32">
        <header className="mb-14 md:mb-20">
          <Eyebrow as="div" className="mb-5">
            Legal
          </Eyebrow>
          <h1 className="font-display text-[2.25rem] md:text-5xl font-bold tracking-tight text-ink leading-[1.05]">
            {title}
          </h1>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-eyebrow text-ink-subtle">
            Last updated · {lastUpdated}
          </p>
          {intro && <p className="mt-8 text-[15px] leading-relaxed text-ink-muted">{intro}</p>}
        </header>

        <div className="space-y-14">{children}</div>

        <footer className="mt-20 border-t border-border pt-8">
          <p className="font-mono text-[10px] uppercase tracking-eyebrow text-ink-subtle">
            End of document
          </p>
        </footer>
      </article>

      <SiteFooter />
    </main>
  );
}

export function Section({
  num,
  title,
  children,
  emphasis,
}: {
  num: string;
  title: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <section
      id={`section-${num}`}
      className={cn(
        "scroll-mt-24",
        emphasis && "rounded-xl border border-signal-warn/25 bg-signal-warn/[0.04] p-6 md:p-8",
      )}
    >
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-ink-subtle">
          {num}
        </span>
        <h2 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-muted [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:text-ink [&_strong]:font-medium [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:marker:text-ink-subtle">
        {children}
      </div>
    </section>
  );
}
