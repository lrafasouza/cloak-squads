"use client";

import { cn } from "@/lib/utils";
import {
  Home,
  List,
  Send,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const NAV = [
  { icon: Home, label: "Home", href: "" },
  { icon: List, label: "Proposals", href: "/proposals" },
  { icon: Send, label: "Send", href: "/send" },
  { icon: Users, label: "Members", href: "/members" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function BottomNav() {
  const params = useParams<{ multisig: string }>();
  const pathname = usePathname();
  const multisig = params?.multisig ?? "";
  const base = `/vault/${multisig}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.04] bg-surface/[0.75] backdrop-blur-xl md:hidden">
      <div className="flex h-16 items-center justify-around pb-safe">
        {NAV.map((item) => {
          const href = `${base}${item.href}`;
          const isActive =
            item.href === ""
              ? pathname === base || pathname === `${base}/`
              : pathname.startsWith(href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-accent" : "text-ink-subtle hover:text-ink",
              )}
            >
              <div className="relative flex h-8 w-8 items-center justify-center">
                {isActive && (
                  <div className="absolute inset-0 rounded-xl bg-accent/10" />
                )}
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
