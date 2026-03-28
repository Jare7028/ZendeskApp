export const APP_ROLES = ["admin", "manager", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

const rolePriority: Record<AppRole, number> = {
  admin: 3,
  manager: 2,
  viewer: 1
};

export function isAppRole(value: string | null | undefined): value is AppRole {
  return Boolean(value && APP_ROLES.includes(value as AppRole));
}

export function getHighestRole(candidates: Array<string | null | undefined>): AppRole {
  const validRoles = candidates.filter(isAppRole);

  if (validRoles.length === 0) {
    return "viewer";
  }

  return validRoles.sort((left, right) => rolePriority[right] - rolePriority[left])[0];
}

export function isAdmin(role: AppRole) {
  return role === "admin";
}

