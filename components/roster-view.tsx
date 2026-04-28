"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Props = {
  rosterText: string;
};

export function RosterView({ rosterText }: Props) {
  const { toast } = useToast();
  const [text, setText] = React.useState(rosterText);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Roster copied to clipboard.", variant: "success" });
    } catch {
      toast({ title: "Copy failed", description: "Try selecting and copying manually.", variant: "error" });
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="focus-ring min-h-[420px] w-full whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>
          Copy to clipboard
        </Button>
        <a href={waUrl} target="_blank" rel="noopener noreferrer">
          <Button type="button" variant="secondary">
            Share to WhatsApp
          </Button>
        </a>
      </div>
    </div>
  );
}
