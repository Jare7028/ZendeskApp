import Link from "next/link";

import { forgotPasswordAction } from "@/app/(auth)/actions";
import { AuthMessage } from "@/components/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ForgotPasswordPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const error = readParam(searchParams.error);
  const message = readParam(searchParams.message);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Reset access
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Request a password reset</h1>
        <p className="text-sm text-muted-foreground">
          Supabase will email a one-time recovery link to the address you enter.
        </p>
      </div>

      <AuthMessage error={error} message={message} />

      <form action={forgotPasswordAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <Button className="w-full" type="submit">
          Send reset email
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Back to{" "}
        <Link className="font-medium text-primary" href="/login">
          sign in
        </Link>
      </p>
    </div>
  );
}

