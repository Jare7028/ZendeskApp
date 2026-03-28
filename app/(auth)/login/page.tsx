import Link from "next/link";

import { loginAction } from "@/app/(auth)/actions";
import { AuthMessage } from "@/components/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({
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
          Sign in
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Access the operations console</h1>
        <p className="text-sm text-muted-foreground">
          Use your Supabase-backed account to reach the protected dashboard.
        </p>
      </div>

      <AuthMessage error={error} message={message} />

      <form action={loginAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link className="text-sm font-medium text-primary" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button className="w-full" type="submit">
          Sign in
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Need an account?{" "}
        <Link className="font-medium text-primary" href="/signup">
          Create one
        </Link>
      </p>
    </div>
  );
}

