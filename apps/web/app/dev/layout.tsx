/**
 * /dev/* namespace — gated to non-production environments only.
 *
 * Audit Pass 4 F-406: design-system preview pages (currently `sprint-a`)
 * were shipping to production. They don't render live wallet data, but
 * they leak internal sprint nomenclature and confirm a `/dev/*` surface
 * exists. Server-side `notFound()` at the layout level means anything
 * under `/dev/` 404s in prod regardless of whether the page is added or
 * forgotten.
 *
 * To work on a dev preview page locally, run `pnpm dev` with NODE_ENV
 * unset or set to "development". On Render (NODE_ENV=production), the
 * route returns 404.
 */
import { notFound } from "next/navigation";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
