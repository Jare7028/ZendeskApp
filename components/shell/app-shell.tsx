import { signOutAction } from "@/app/(app)/actions";
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
        <aside className="flex min-h-full flex-col rounded-[28px] border bg-card/90 p-5 shadow-panel">
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
          <div className="mt-auto border-t border-border/60 pt-4">
            <form action={signOutAction}>
              <Button className="h-9 w-full justify-start rounded-xl px-3 text-sm" type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </div>
        </aside>

        <main className="rounded-[28px] border bg-card/85 p-5 shadow-panel sm:p-6">{children}</main>
      </div>
    </div>
  );
}

