import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "Zendesk connections",
    description: "Stores encrypted token columns and metadata for each tenant connection."
  },
  {
    title: "Connecteam connections",
    description: "Mirrors the client-scoped connection model for workforce and timesheet data."
  },
  {
    title: "Viewer access",
    description: "RLS policies allow viewers to see only the clients they are explicitly assigned to."
  }
];

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder surfaces for the protected area. Later milestones will replace these panels with real
          onboarding and sync status.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Schema support exists in Supabase migrations; UI hooks are intentionally minimal in M1.
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

