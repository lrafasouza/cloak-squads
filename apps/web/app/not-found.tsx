import Link from "next/link";
import { Ghost } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <Ghost className="w-16 h-16 text-ink-faint mb-6" strokeWidth={1.5} />
      <h1 className="text-3xl font-display text-ink mb-2">404 — Not Found</h1>
      <p className="text-ink-muted text-center mb-8 max-w-sm">
        This page does not exist. It may have been moved or removed.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-ink font-medium hover:bg-accent-hover transition-colors"
      >
        Go back home
      </Link>
    </div>
  );
}
