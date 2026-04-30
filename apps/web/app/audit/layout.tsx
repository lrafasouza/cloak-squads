import { SiteHeader } from "@/components/site/SiteHeader";
import type { ReactNode } from "react";

export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
