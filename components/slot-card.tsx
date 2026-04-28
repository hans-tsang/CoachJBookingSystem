import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SlotCardData = {
  id: string;
  time: string;
  capacity: number;
  confirmedCount: number;
  waitlistCount: number;
};

export function SlotCard({ slot, selected }: { slot: SlotCardData; selected?: boolean }) {
  const pct = Math.min(100, Math.round((slot.confirmedCount / slot.capacity) * 100));
  const isFull = slot.confirmedCount >= slot.capacity;

  return (
    <Card
      className={cn(
        "transition-shadow",
        selected && "ring-2 ring-[var(--color-brand)]",
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{slot.time}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              isFull
                ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                : "bg-[var(--color-success)]/15 text-[var(--color-success)]",
            )}
          >
            {isFull ? "Waitlist" : "Open"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-[var(--color-muted-foreground)]">
          {slot.confirmedCount} / {slot.capacity} confirmed
          {slot.waitlistCount > 0 ? ` · ${slot.waitlistCount} on waitlist` : ""}
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]"
          aria-hidden
        >
          <div
            className="h-full bg-[var(--color-brand)] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
