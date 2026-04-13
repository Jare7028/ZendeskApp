import { redirect } from "next/navigation";

import { createScoutJobAction, updateScoutJobStatusAction } from "@/app/(app)/scout/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentUserContext } from "@/lib/auth/session";
import { listScoutJobs, SCOUT_STATUSES, type ScoutJob, type ScoutStatus } from "@/lib/scout";

export const dynamic = "force-dynamic";

type ScoutPageProps = {
  searchParams?: {
    q?: string;
    status?: string;
    scout?: string;
    detail?: string;
  };
};

const statusLabels: Record<ScoutStatus, string> = {
  active: "Active",
  watchlist: "Watchlist",
  contacted: "Contacted",
  ignore: "Ignore"
};

const statusTone: Record<ScoutStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  watchlist: "bg-amber-100 text-amber-800",
  contacted: "bg-sky-100 text-sky-800",
  ignore: "bg-zinc-200 text-zinc-800"
};

function getMessage(code?: string, detail?: string) {
  switch (code) {
    case "created":
      return { tone: "success", text: "Job saved." };
    case "updated":
      return { tone: "success", text: "Status updated." };
    case "missing-fields":
      return { tone: "error", text: "Company and role title are required." };
    case "ignore-reason-required":
      return { tone: "error", text: "Ignore needs a reason." };
    case "invalid-status":
      return { tone: "error", text: "Invalid status." };
    case "missing-job":
      return { tone: "error", text: detail || "Job not found." };
    case "create-failed":
    case "update-failed":
    case "history-failed":
      return { tone: "error", text: detail || "Scout update failed." };
    default:
      return null;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function JobRow({ job }: { job: ScoutJob }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/85 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusTone[job.status]}>{statusLabels[job.status]}</Badge>
            {job.source_name ? <Badge className="bg-secondary text-secondary-foreground">{job.source_name}</Badge> : null}
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{job.role_title}</h3>
            <p className="text-sm text-muted-foreground">{job.company_name}</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {job.location_text ? <span>{job.location_text}</span> : null}
            {job.employment_type ? <span>{job.employment_type}</span> : null}
            {job.compensation_text ? <span>{job.compensation_text}</span> : null}
            <span>Updated {formatDateTime(job.status_updated_at)}</span>
          </div>
          {job.role_summary ? <p className="max-w-3xl text-sm text-muted-foreground">{job.role_summary}</p> : null}
          {job.status === "ignore" && job.ignore_reason ? (
            <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-foreground">
              <span className="font-medium">Ignore reason:</span> {job.ignore_reason}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 text-sm">
            {job.source_url ? (
              <a
                className="text-primary underline-offset-4 hover:underline"
                href={job.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Open source
              </a>
            ) : null}
            {job.contacted_at ? <span className="text-muted-foreground">Contacted {formatDateTime(job.contacted_at)}</span> : null}
            {job.ignored_at ? <span className="text-muted-foreground">Ignored {formatDateTime(job.ignored_at)}</span> : null}
          </div>
        </div>

        <form action={updateScoutJobStatusAction} className="w-full max-w-xl space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4">
          <input name="jobId" type="hidden" value={job.id} />
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Status</span>
              <select
                className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={job.status}
                name="status"
              >
                {SCOUT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Ignore reason</span>
              <Textarea
                defaultValue={job.ignore_reason ?? ""}
                name="ignoreReason"
                placeholder="Required when status is Ignore"
                className="min-h-[88px]"
              />
            </label>
            <Button type="submit" className="w-full md:w-auto">
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default async function ScoutPage({ searchParams }: ScoutPageProps) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const query = String(searchParams?.q ?? "").trim();
  const statusFilter = String(searchParams?.status ?? "").trim();
  const jobs = await listScoutJobs({ query, status: statusFilter });
  const message = getMessage(searchParams?.scout, searchParams?.detail);

  const counts = jobs.reduce(
    (acc, job) => {
      acc.total += 1;
      acc[job.status] += 1;
      return acc;
    },
    { total: 0, active: 0, watchlist: 0, contacted: 0, ignore: 0 }
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Role scout</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">CS hiring tracker</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Keep role leads inside ResOpsHub, update status in one place, and capture why roles get ignored.
          </p>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total roles" value={counts.total} />
        <StatCard label="Active" value={counts.active} />
        <StatCard label="Watchlist" value={counts.watchlist} />
        <StatCard label="Contacted" value={counts.contacted} />
        <StatCard label="Ignored" value={counts.ignore} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Tracked roles</CardTitle>
            <CardDescription>Filter the shortlist, update status, and keep ignore reasons queryable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_auto]">
              <Input defaultValue={query} name="q" placeholder="Search company, role, location" />
              <select
                className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={statusFilter}
                name="status"
              >
                <option value="">All statuses</option>
                {SCOUT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <Button type="submit">Filter</Button>
            </form>

            {jobs.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/80 px-6 py-10 text-center text-sm text-muted-foreground">
                No tracked roles yet.
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Add role</CardTitle>
            <CardDescription>Quick capture for the first integrated scout slice.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createScoutJobAction} className="space-y-3">
              <Input name="companyName" placeholder="Company name" required />
              <Input name="roleTitle" placeholder="Role title" required />
              <Input name="locationText" placeholder="Location" />
              <Input name="employmentType" placeholder="Employment type" />
              <Input name="compensationText" placeholder="Compensation" />
              <Input name="sourceName" placeholder="Source" />
              <Input name="sourceUrl" placeholder="Source URL" type="url" />
              <Textarea name="roleSummary" placeholder="Notes or summary" className="min-h-[120px]" />
              <Button className="w-full" type="submit">
                Save role
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
