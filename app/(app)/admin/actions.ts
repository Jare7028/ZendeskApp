"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUserContext } from "@/lib/auth/session";
import { saveAgentMappingOverride } from "@/lib/connecteam/sync";

const IGNORE_MAPPING_VALUE = "__ignore__";

function buildAdminRedirect(status: string, detail?: string) {
  const search = new URLSearchParams({ sync: status });

  if (detail) {
    search.set("detail", detail);
  }

  return `/admin?${search.toString()}`;
}

async function requireAdmin() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role !== "admin") {
    redirect("/dashboard");
  }

  return context;
}

export async function saveAgentMappingOverrideAction(formData: FormData) {
  await requireAdmin();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const zendeskConnectionId = String(formData.get("zendeskConnectionId") ?? "").trim();
  const connecteamConnectionId = String(formData.get("connecteamConnectionId") ?? "").trim();
  const zendeskAgentId = String(formData.get("zendeskAgentId") ?? "").trim();
  const connecteamUserIdRaw = String(formData.get("connecteamUserId") ?? "").trim();

  if (!clientId || !zendeskConnectionId || !connecteamConnectionId || !zendeskAgentId) {
    redirect(buildAdminRedirect("mapping-missing-fields"));
  }

  try {
    const inclusionStatus =
      connecteamUserIdRaw === IGNORE_MAPPING_VALUE ? "ignored" : connecteamUserIdRaw ? "mapped" : "unmapped";

    await saveAgentMappingOverride({
      clientId,
      zendeskConnectionId,
      connecteamConnectionId,
      zendeskAgentId,
      connecteamUserId: inclusionStatus === "mapped" ? connecteamUserIdRaw : null,
      inclusionStatus
    });
    revalidatePath("/admin");
    redirect(buildAdminRedirect("mapping-saved"));
  } catch (error) {
    revalidatePath("/admin");
    redirect(buildAdminRedirect("mapping-save-failed", error instanceof Error ? error.message : undefined));
  }
}

export async function saveAgentMappingBulkReviewAction(formData: FormData) {
  await requireAdmin();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const zendeskConnectionId = String(formData.get("zendeskConnectionId") ?? "").trim();
  const connecteamConnectionId = String(formData.get("connecteamConnectionId") ?? "").trim();
  const redirectHash = String(formData.get("redirectHash") ?? "").trim();
  const zendeskAgentIds = formData.getAll("zendeskAgentId").map((value) => String(value).trim());
  const connecteamUserIds = formData.getAll("connecteamUserId").map((value) => String(value).trim());

  if (
    !clientId ||
    !zendeskConnectionId ||
    !connecteamConnectionId ||
    zendeskAgentIds.length === 0 ||
    zendeskAgentIds.length !== connecteamUserIds.length
  ) {
    redirect(buildAdminRedirect("mapping-missing-fields"));
  }

  const selectedUserIds = connecteamUserIds.filter(
    (value) => value !== "" && value !== IGNORE_MAPPING_VALUE
  );

  if (new Set(selectedUserIds).size !== selectedUserIds.length) {
    redirect(buildAdminRedirect("mapping-save-failed", "Duplicate Connecteam users selected in the same review batch."));
  }

  try {
    for (let index = 0; index < zendeskAgentIds.length; index += 1) {
      const zendeskAgentId = zendeskAgentIds[index];
      const connecteamUserIdRaw = connecteamUserIds[index];
      const inclusionStatus =
        connecteamUserIdRaw === IGNORE_MAPPING_VALUE ? "ignored" : connecteamUserIdRaw ? "mapped" : "unmapped";

      await saveAgentMappingOverride({
        clientId,
        zendeskConnectionId,
        connecteamConnectionId,
        zendeskAgentId,
        connecteamUserId: inclusionStatus === "mapped" ? connecteamUserIdRaw : null,
        inclusionStatus
      });
    }

    revalidatePath("/admin");
    redirect(`${buildAdminRedirect("mapping-saved", `${zendeskAgentIds.length} overrides saved`)}${redirectHash}`);
  } catch (error) {
    revalidatePath("/admin");
    redirect(buildAdminRedirect("mapping-save-failed", error instanceof Error ? error.message : undefined));
  }
}
