"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type Tab = { id: string; label: string };

export function Tabs({
  tabs,
  children,
}: {
  tabs: Tab[];
  children: (active: string) => React.ReactNode;
}) {
  const [active, setActive] = React.useState(tabs[0]?.id ?? "");
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]"
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={cn(
                "focus-ring -mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                  : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-fg)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}
