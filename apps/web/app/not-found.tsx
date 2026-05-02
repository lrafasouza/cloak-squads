import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-ink">
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-surface shadow-raise-1">
        <Compass className="h-9 w-9 text-accent" strokeWidth={1.5} />
        <div className="pointer-events-none absolute -inset-4 rounded-full bg-accent/[0.04] blur-2xl" />
      </div>
      <h1 className="mb-2 font-display text-4xl font-bold text-ink">404</h1>
      <p className="mb-8 max-w-xs text-center text-ink-muted">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Button>
      </Link>
    </main>
  );
}
