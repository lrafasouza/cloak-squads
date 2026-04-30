import { AppShell } from "@/components/app/AppShell";
import type { ReactNode } from "react";

export default function VaultLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
