import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/admin");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
          HYROX Admin
        </p>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Enter the admin password to manage bookings.
        </p>
      </header>
      <LoginForm />
    </main>
  );
}
