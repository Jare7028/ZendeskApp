import { StatusCard } from "@/components/dashboard/status-card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-3 rounded-[28px] border bg-card/90 p-6 shadow-panel sm:p-8">
        <Badge>{context.role}</Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Protected dashboard shell</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            This milestone establishes the authenticated shell, role-aware navigation, and Supabase-backed
            RBAC foundation for later analytics work.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="Authentication"
          value="Ready"
          description="Email/password login, signup, password reset, and callback exchange are wired."
        />
        <StatusCard
          title="Role model"
          value={context.role}
          description="Primary role is resolved from Supabase and used to shape navigation and guards."
        />
        <StatusCard
          title="Next milestone"
          value="Data sync"
          description="Connection tables and protected views are in place for Zendesk and Connecteam ingestion."
        />
      </section>
    </div>
  );
}

