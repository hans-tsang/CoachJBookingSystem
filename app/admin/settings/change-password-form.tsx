"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type AdminActionResult } from "@/app/admin/actions";

function PendingButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {children}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [passwordState, setPasswordState] = React.useState<AdminActionResult | null>(null);
  return (
    <form
      action={async (fd) => setPasswordState(await changePasswordAction(passwordState, fd))}
      className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <h3 className="text-base font-semibold">Change admin password</h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">New password (min 8 chars)</Label>
        <Input id="newPassword" name="newPassword" type="password" required minLength={8} />
      </div>
      {passwordState ? (
        <p
          role="status"
          className={
            passwordState.ok
              ? "text-sm text-[var(--color-success)]"
              : "text-sm text-[var(--color-danger)]"
          }
        >
          {passwordState.ok ? passwordState.message : passwordState.error}
        </p>
      ) : null}
      <PendingButton>Update password</PendingButton>
    </form>
  );
}
