import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function AdminPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Admin controls</h1>
        <p className="text-sm text-muted-foreground">
          Reserved for bootstrap, user-role management, and connection administration in later milestones.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation scope</CardTitle>
          <CardDescription>Admin-only route guard proves role-based page protection.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the documented bootstrap SQL to elevate the first authenticated account, then manage future
          assignments directly in Supabase until a dedicated admin UI is added.
        </CardContent>
      </Card>
    </div>
  );
}

