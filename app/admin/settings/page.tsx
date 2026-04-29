import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/admin"
          className="text-sm text-[var(--color-muted-foreground)] underline-offset-4 hover:underline"
        >
          ← Sessions
        </Link>
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-brand)]">
          Coach J Admin
        </p>
        <h1 className="text-2xl font-bold">Account</h1>
      </header>
      <ChangePasswordForm />
    </main>
  );
}
