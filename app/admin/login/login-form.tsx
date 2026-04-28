"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type AdminActionResult } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full" size="lg">
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = React.useActionState<AdminActionResult | null, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Admin password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
