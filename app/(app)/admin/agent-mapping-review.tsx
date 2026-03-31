import type { getConnecteamAdminOverview } from "@/lib/connecteam/status";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveAgentMappingBulkReviewAction } from "./actions";

const IGNORE_MAPPING_VALUE = "__ignore__";

type AdminConnection = Awaited<ReturnType<typeof getConnecteamAdminOverview>>[number];
type AssignmentRow = AdminConnection["assignmentRows"][number];
type AgentRow = AssignmentRow["zendeskAgents"][number];

function defaultConnecteamUserId(agent: AgentRow) {
  if (agent.mapping?.inclusion_status === "ignored") {
    return IGNORE_MAPPING_VALUE;
  }

  return agent.mapping?.connecteam_user_id ?? "";
}

function toneClassName(agent: AgentRow) {
  if (agent.hasProblem) {
    return "border-rose-200 bg-rose-50/70";
  }

  if (agent.reviewBucket === "ignored") {
    return "border-slate-200 bg-slate-50";
  }

  if (agent.reviewBucket === "mapped") {
    return "border-emerald-200 bg-emerald-50/60";
  }

  return "border-amber-200 bg-amber-50/70";
}

function selectClassName(agent: AgentRow) {
  if (agent.hasProblem) {
    return "border-rose-300";
  }

  if (agent.reviewBucket === "mapped") {
    return "border-emerald-300";
  }

  if (agent.reviewBucket === "ignored") {
    return "border-slate-300";
  }

  return "border-amber-300";
}

function statusLabel(agent: AgentRow) {
  if (agent.hasProblem) {
    return "problem";
  }

  if (agent.reviewBucket === "needs_action") {
    return "needs action";
  }

  return agent.reviewBucket;
}

function assignmentAnchorId(assignment: AssignmentRow) {
  return `mapping-${assignment.id}`;
}

function renderBulkSection(
  assignment: AssignmentRow,
  agents: AgentRow[],
  options: {
    title: string;
    description: string;
    defaultOpen?: boolean;
  }
) {
  if (agents.length === 0) {
    return null;
  }

  const content = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">{options.title}</h4>
          <p className="text-xs text-muted-foreground">{options.description}</p>
        </div>
        <Button type="submit" variant="outline">
          Save {agents.length} rows
        </Button>
      </div>

      {agents.map((agent) => (
        <div
          className={`grid gap-3 rounded-2xl border px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(220px,0.9fr)_minmax(0,1fr)] ${toneClassName(agent)}`}
          key={`${assignment.id}:${agent.zendeskAgentId}`}
        >
          <input type="hidden" name="zendeskAgentId" value={agent.zendeskAgentId} />

          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {agent.zendeskName ?? agent.email ?? agent.zendeskAgentId}
            </p>
            <p className="text-muted-foreground">{agent.email ?? "No email on Zendesk agent"}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className={agent.hasProblem ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-900"}>
                {statusLabel(agent)}
              </Badge>
              <Badge className="bg-slate-100 text-slate-900">
                {agent.mapping?.match_source ?? "unmatched"}
              </Badge>
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {agent.mapping?.connecteam_user_name ?? "No Connecteam user selected"}
            </p>
            <p className="text-muted-foreground">
              {agent.mapping?.connecteam_user_id ?? "Currently excluded from staffing metrics"}
            </p>
            {agent.suggestedUser ? (
              <p className="text-xs text-emerald-700">
                Suggested: {agent.suggestedUser.full_name ?? agent.suggestedUser.email ?? agent.suggestedUser.connecteam_user_id}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <select
              className={`flex h-11 w-full rounded-2xl border bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring ${selectClassName(agent)}`}
              defaultValue={defaultConnecteamUserId(agent)}
              name="connecteamUserId"
            >
              <option value="">Unmapped (exclude by default)</option>
              <option value={IGNORE_MAPPING_VALUE}>Ignore intentionally</option>
              {assignment.users.map((user) => (
                <option key={user.connecteam_user_id} value={user.connecteam_user_id}>
                  {user.full_name ?? user.email ?? user.connecteam_user_id}
                  {user.email ? ` (${user.email})` : ""}
                  {agent.suggestedUser?.connecteam_user_id === user.connecteam_user_id ? " - suggested" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{agent.reviewReason}</p>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Included status: <span className="font-medium text-foreground">{agent.mapping?.inclusion_status ?? "unmapped"}</span>
            </p>
            <p>
              Override source: <span className="font-medium text-foreground">{agent.mapping?.match_source ?? "unmatched"}</span>
            </p>
            <p>
              Operator note:{" "}
              <span className="font-medium text-foreground">
                {agent.hasProblem ? "Needs manual review before metrics trust this row." : "Ready for batch review."}
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <form action={saveAgentMappingBulkReviewAction} className="space-y-3">
      <input type="hidden" name="clientId" value={assignment.client_id} />
      <input type="hidden" name="zendeskConnectionId" value={assignment.zendesk_connection_id} />
      <input type="hidden" name="connecteamConnectionId" value={assignment.connecteam_connection_id} />
      <input type="hidden" name="redirectHash" value={`#${assignmentAnchorId(assignment)}`} />
      {options.defaultOpen === false ? (
        <details className="rounded-2xl border border-border bg-muted/10 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
            {options.title} ({agents.length})
          </summary>
          <div className="mt-3">{content}</div>
        </details>
      ) : (
        content
      )}
    </form>
  );
}

export function AgentMappingReview({ connection }: { connection: AdminConnection }) {
  const reviewAssignments = connection.assignmentRows
    .filter(
      (assignment) =>
        assignment.reviewSummary.total > 0 &&
        (assignment.reviewSummary.needsAction > 0 ||
          assignment.reviewSummary.ignored > 0 ||
          assignment.reviewSummary.problems > 0)
    )
    .sort((left, right) => {
      if (right.reviewSummary.problems !== left.reviewSummary.problems) {
        return right.reviewSummary.problems - left.reviewSummary.problems;
      }

      if (right.reviewSummary.needsAction !== left.reviewSummary.needsAction) {
        return right.reviewSummary.needsAction - left.reviewSummary.needsAction;
      }

      if (right.reviewSummary.ignored !== left.reviewSummary.ignored) {
        return right.reviewSummary.ignored - left.reviewSummary.ignored;
      }

      return (left.scheduler_name ?? left.scheduler_id).localeCompare(
        right.scheduler_name ?? right.scheduler_id
      );
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Agent identity mapping</h2>
        <p className="text-sm text-muted-foreground">
          Review action-needed rows first, then clear ignored queues in batches. Mapped agents stay available lower in
          each assignment for spot checks.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-900">Needs action</p>
          <p className="text-2xl font-semibold text-foreground">{connection.mappingReviewSummary.needsAction}</p>
          <p className="text-xs text-amber-900">Unmapped or broken rows that block clean staffing inclusion.</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-900">Problems</p>
          <p className="text-2xl font-semibold text-foreground">{connection.mappingReviewSummary.problems}</p>
          <p className="text-xs text-rose-900">Rows with missing users, duplicate emails, or no agent email.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-900">Ignored queue</p>
          <p className="text-2xl font-semibold text-foreground">{connection.mappingReviewSummary.ignored}</p>
          <p className="text-xs text-slate-900">Excluded intentionally. Revisit here when coverage needs to improve.</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-900">Mapped coverage</p>
          <p className="text-2xl font-semibold text-foreground">{connection.mappingReviewSummary.mapped}</p>
          <p className="text-xs text-emerald-900">
            {connection.mappingReviewSummary.total === 0
              ? "No agents discovered yet."
              : `${Math.round((connection.mappingReviewSummary.mapped / connection.mappingReviewSummary.total) * 100)}% of rows currently included.`}
          </p>
        </div>
      </div>

      {reviewAssignments.length > 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Priority review queue</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reviewAssignments.map((assignment) => (
              <a
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
                href={`#${assignmentAnchorId(assignment)}`}
                key={assignment.id}
              >
                {assignment.scheduler_name ?? assignment.scheduler_id} · {assignment.reviewSummary.needsAction} action
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {connection.assignmentRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          No scheduler assignments exist for this Connecteam connection yet.
        </div>
      ) : null}

      <div className="space-y-3">
        {connection.assignmentRows.map((assignment) => (
          <section className="space-y-4 rounded-[24px] border border-border px-4 py-4" id={assignmentAnchorId(assignment)} key={assignment.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  {assignment.client?.name ?? "Unknown client"} · {assignment.zendeskConnection?.name ?? "Unknown Zendesk connection"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Scheduler {assignment.scheduler_name ?? assignment.scheduler_id}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-amber-100 text-amber-900">
                  {assignment.reviewSummary.needsAction} needs action
                </Badge>
                <Badge className="bg-rose-100 text-rose-900">{assignment.reviewSummary.problems} problems</Badge>
                <Badge className="bg-slate-100 text-slate-900">{assignment.reviewSummary.ignored} ignored</Badge>
                <Badge className="bg-emerald-100 text-emerald-900">{assignment.reviewSummary.mapped} mapped</Badge>
              </div>
            </div>

            {assignment.zendeskAgents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No Zendesk agents have been synced for this assignment yet.
              </div>
            ) : (
              <div className="space-y-4">
                {renderBulkSection(assignment, assignment.reviewGroups.needsAction, {
                  title: "Needs action first",
                  description: "Work this queue first to clear unmapped rows and fix broken mappings."
                })}
                {renderBulkSection(assignment, assignment.reviewGroups.ignored, {
                  title: "Ignored rows",
                  description: "Keep intentional exclusions visible, but batch them when coverage priorities change.",
                  defaultOpen: false
                })}
                {assignment.reviewGroups.mapped.length > 0 ? (
                  <details className="rounded-2xl border border-border bg-muted/10 px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                      Healthy mapped rows ({assignment.reviewGroups.mapped.length})
                    </summary>
                    <div className="mt-3">
                      {renderBulkSection(assignment, assignment.reviewGroups.mapped, {
                        title: "Mapped rows",
                        description: "Spot-check healthy mappings here without crowding the action queues.",
                        defaultOpen: true
                      })}
                    </div>
                  </details>
                ) : null}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
