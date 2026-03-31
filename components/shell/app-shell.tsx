import { signOutAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { type UserContext } from "@/lib/auth/session";

export function AppShell({
  context,
  children
}: {
  context: UserContext;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border bg-card/90 p-5 shadow-panel">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Ops Console
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">Analytics foundation</h1>
              <p className="text-sm text-muted-foreground">
                Protected navigation for Zendesk and Connecteam operations reporting.
              </p>
            </div>
            <SidebarNav role={context.role} />
          </div>
        </aside>

        <div className="flex min-h-full flex-col gap-4">
          <header className="flex flex-col gap-4 rounded-[28px] border bg-card/90 p-5 shadow-panel sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge>{context.role}</Badge>
                <p className="text-sm text-muted-foreground">Authenticated shell</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{context.fullName ?? context.email}</p>
                <p className="text-sm text-muted-foreground">{context.email}</p>
              </div>
            </div>

            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </header>

          <main className="flex-1 rounded-[28px] border bg-card/85 p-5 shadow-panel sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

