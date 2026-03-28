import { redirect } from "next/navigation";

import { resetPasswordAction } from "@/app/(auth)/actions";
import { AuthMessage } from "@/components/auth/auth-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerSessionUser } from "@/lib/auth/session";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const user = await getServerSessionUser();

  if (!user) {
    redirect("/login");
  }

  const error = readParam(searchParams.error);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Set new password
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Choose a fresh password</h1>
        <p className="text-sm text-muted-foreground">
          This page is only reachable with a valid session or recovery link.
        </p>
      </div>

      <AuthMessage error={error} />

      <form action={resetPasswordAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <Button className="w-full" type="submit">
          Update password
        </Button>
      </form>
    </div>
  );
}

