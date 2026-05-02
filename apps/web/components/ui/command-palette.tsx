"use client";

import { cn } from "@/lib/utils";
import { Command } from "cmdk";
import {
  ArrowRight,
  Home,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ACTIONS = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    shortcut: "H",
    href: "/",
  },
  {
    id: "vault",
    label: "My Vaults",
    icon: Wallet,
    shortcut: "V",
    href: "/vault",
  },
  {
    id: "send",
    label: "Send",
    icon: Send,
    shortcut: "S",
    href: "/vault",
  },
  {
    id: "create",
    label: "Create new vault",
    icon: Plus,
    shortcut: "C",
    href: "https://squads.so",
    external: true,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    shortcut: ",",
    href: "/vault",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    shortcut: "E",
    href: "/#security",
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (href: string, external?: boolean) => {
      setOpen(false);
      if (external) {
        window.open(href, "_blank");
      } else {
        router.push(href);
      }
    },
    [router],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-cmdk flex items-start justify-center pt-[20vh] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <Command
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-raise-2"
        loop
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-subtle" />
          <Command.Input
            placeholder="Search commands, pages..."
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-ink-muted">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigation">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Command.Item
                  key={action.id}
                  onSelect={() => handleSelect(action.href, action.external)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink transition-colors",
                    "hover:bg-surface-2 aria-selected:bg-surface-2",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    <Icon className="h-4 w-4 text-accent" strokeWidth={1.5} />
                  </div>
                  <span className="flex-1">{action.label}</span>
                  {action.external && (
                    <ArrowRight className="h-3.5 w-3.5 text-ink-subtle" />
                  )}
                  <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-ink-subtle">
                    {action.shortcut}
                  </kbd>
                </Command.Item>
              );
            })}
          </Command.Group>

          <div className="mt-2 px-3 py-2">
            <p className="text-[10px] text-ink-subtle">
              Press{" "}
              <kbd className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px]">Esc</kbd>{" "}
              to close
            </p>
          </div>
        </Command.List>
      </Command>
    </div>
  );
}
