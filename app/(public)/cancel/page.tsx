import Link from "next/link";
import { CancelForm } from "@/components/cancel-form";

export default function CancelPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href="/"
          className="text-sm text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Cancel booking</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Enter the name and WhatsApp number used when you booked.
        </p>
      </header>
      <CancelForm />
    </main>
  );
}
