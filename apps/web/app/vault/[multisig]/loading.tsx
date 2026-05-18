/**
 * Route-level Suspense fallback shown while navigating into a vault.
 *
 * Audit (frontend P1): "No Suspense boundaries on async page data — causes
 * layout thrash". Without this file, the previous route's UI stays visible
 * (or the screen goes blank) until the dashboard's TanStack queries resolve.
 * With it, Next.js streams this skeleton instantly while the page renders.
 *
 * Keep this purely visual: no client hooks, no data, no wallet adapter.
 * The skeleton should mirror VaultDashboard's gross layout (header strip +
 * KPI row + content card) so the perceived load is "filling in" rather
 * than "swap-in".
 */
export default function VaultLoading() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header strip */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 shimmer-bg rounded" />
            <div className="h-8 w-64 shimmer-bg rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 shimmer-bg rounded-lg" />
            <div className="h-10 w-28 shimmer-bg rounded-lg" />
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-surface p-5 space-y-3">
              <div className="h-3 w-20 shimmer-bg rounded" />
              <div className="h-7 w-32 shimmer-bg rounded" />
              <div className="h-3 w-16 shimmer-bg rounded" />
            </div>
          ))}
        </div>

        {/* Main content card */}
        <div className="mt-8 rounded-lg border border-border/60 bg-surface p-6 space-y-4">
          <div className="h-5 w-40 shimmer-bg rounded" />
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 shimmer-bg rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/5 shimmer-bg rounded" />
                  <div className="h-3 w-2/5 shimmer-bg rounded" />
                </div>
                <div className="h-4 w-20 shimmer-bg rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
