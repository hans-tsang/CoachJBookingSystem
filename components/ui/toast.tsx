"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Toast = {
  id: number;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "error";
};

type Ctx = {
  toast: (t: Omit<Toast, "id">) => void;
};

const ToastContext = React.createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const idRef = React.useRef(0);

  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-md border bg-[var(--color-card)] p-3 text-sm shadow-lg",
              t.variant === "success" && "border-[var(--color-success)]",
              t.variant === "error" && "border-[var(--color-danger)]",
            )}
          >
            {t.title ? <div className="font-semibold">{t.title}</div> : null}
            {t.description ? (
              <div className="text-[var(--color-muted-foreground)]">{t.description}</div>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
