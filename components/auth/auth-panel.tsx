export function AuthPanel() {
  return (
    <section className="relative overflow-hidden rounded-[32px] border bg-primary px-6 py-8 text-primary-foreground shadow-panel sm:px-8 sm:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.28),transparent_30%)]" />
      <div className="relative space-y-10">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary-foreground/75">
            Ops Console
          </p>
          <h2 className="max-w-md text-4xl font-semibold tracking-tight">
            Zendesk and Connecteam reporting, with a controlled foundation first.
          </h2>
          <p className="max-w-md text-sm leading-6 text-primary-foreground/80">
            M1 provides the production scaffold: protected routes, Supabase auth, default viewer provisioning,
            and client-scoped RLS that can grow into the full analytics product.
          </p>
        </div>

        <div className="grid gap-3 text-sm text-primary-foreground/85 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="font-medium">Protected app shell</p>
            <p className="mt-2 text-primary-foreground/75">Sidebar, header, and route guards are live.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="font-medium">RBAC foundation</p>
            <p className="mt-2 text-primary-foreground/75">Admins manage all, managers read broadly, viewers stay scoped.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

