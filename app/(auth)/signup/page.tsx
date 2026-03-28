import Link from "next/link";

import { signupAction } from "@/app/(auth)/actions";
import { AuthMessage } from "@/components/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function SignupPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const error = readParam(searchParams.error);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Create account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Start with a viewer seat</h1>
        <p className="text-sm text-muted-foreground">
          New users are provisioned as viewers until an admin or bootstrap step assigns wider access.
        </p>
      </div>

      <AuthMessage error={error} />

      <form action={signupAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </div>
        <Button className="w-full" type="submit">
          Create account
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}

