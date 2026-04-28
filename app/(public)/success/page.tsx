import Link from "next/link";

type SearchParams = Promise<{
  status?: string;
  position?: string;
  name?: string;
}>;

export default async function SuccessPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = params.status === "Waitlist" ? "Waitlist" : "Confirmed";
  const position = params.position;
  const name = params.name ?? "";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 text-center">
      <div
        className={
          status === "Confirmed"
            ? "rounded-lg border border-[var(--color-success)] bg-[var(--color-success)]/10 p-6"
            : "rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning)]/10 p-6"
        }
      >
        <h1 className="text-2xl font-bold">
          {status === "Confirmed" ? "You're confirmed!" : "You're on the waitlist"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {status === "Confirmed"
            ? `Thanks${name ? `, ${name}` : ""}. See you on Saturday.`
            : `Thanks${name ? `, ${name}` : ""}. You're #${position ?? "?"} on the waitlist — we'll email you if a spot opens up.`}
        </p>
      </div>
      <Link href="/" className="text-sm text-[var(--color-brand)] underline-offset-4 hover:underline">
        ← Back to bookings
      </Link>
    </main>
  );
}
