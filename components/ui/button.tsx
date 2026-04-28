import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-[var(--color-muted)] text-[var(--color-fg)] hover:opacity-80 disabled:opacity-50",
  outline:
    "border border-[var(--color-border)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)] disabled:opacity-50",
  ghost: "bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)] disabled:opacity-50",
  danger:
    "bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "focus-ring inline-flex items-center justify-center gap-2 rounded-md font-medium transition-opacity disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
