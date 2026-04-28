import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      {...props}
      className={cn(
        "border-b border-[var(--color-border)] bg-[var(--color-muted)] text-left",
        props.className,
      )}
    />
  );
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...props}
      className={cn("border-b border-[var(--color-border)] last:border-0", props.className)}
    />
  );
}

export function TH(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn("px-3 py-2 text-xs font-medium uppercase tracking-wide", props.className)}
    />
  );
}

export function TD(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn("px-3 py-2 align-middle", props.className)} />;
}
