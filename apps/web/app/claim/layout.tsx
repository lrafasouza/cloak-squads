import { SiteHeader } from "@/components/site/SiteHeader";
import type { ReactNode } from "react";

export default function ClaimLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
