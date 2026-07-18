import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A ₱-prefixed numeric input. Spread react-hook-form's register() onto it. */
export function MoneyInput({
  className,
  suffix,
  ...props
}: ComponentProps<typeof Input> & { suffix?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₱
      </span>
      <Input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        className={cn("pl-7", suffix ? "pr-16" : "", className)}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
