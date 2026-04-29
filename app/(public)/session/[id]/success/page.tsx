import Link from "next/link";

type SearchParams = Promise<{
  status?: string;
  position?: string;
  name?: string;
}>;

type Params = Promise<{ id: string }>;

export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const status = sp.status === "Waitlist" ? "Waitlist" : "Confirmed";
  const position = sp.position;
  const name = sp.name ?? "";

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
            ? `Thanks${name ? `, ${name}` : ""}. See you at the session.`
            : `Thanks${name ? `, ${name}` : ""}. You're #${position ?? "?"} on the waitlist — we'll email you if a spot opens up.`}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          href={`/session/${id}`}
          className="text-sm text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          ← Back to this session
        </Link>
        <Link
          href="/"
          className="text-sm text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          All sessions
        </Link>
      </div>
    </main>
  );
}
