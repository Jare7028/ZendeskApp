import "server-only";

import { cache } from "react";

import { getHighestRole, type AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RoleRow = {
  is_primary: boolean;
  roles: {
    name: string;
  } | null;
};

type UserRow = {
  user_id: string;
  email: string;
  full_name: string | null;
};

export type UserContext = {
  userId: string;
  email: string;
  fullName: string | null;
  role: AppRole;
};

export const getServerSessionUser = cache(async () => {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
});

export const getCurrentUserContext = cache(async (): Promise<UserContext | null> => {
  const user = await getServerSessionUser();

  if (!user?.id || !user.email) {
    return null;
  }

  const supabase = createServerSupabaseClient().schema("app");
  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase.from("users").select("user_id,email,full_name").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("user_role_assignments")
      .select("is_primary, roles(name)")
      .eq("user_id", user.id)
      .returns<RoleRow[]>()
  ]);

  const primaryRole = getHighestRole(
    (assignments ?? [])
      .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))
      .map((assignment) => assignment.roles?.name)
  );

  const typedProfile = profile as UserRow | null;

  return {
    userId: user.id,
    email: typedProfile?.email ?? user.email,
    fullName: typedProfile?.full_name ?? ((user.user_metadata.full_name as string | undefined) ?? null),
    role: primaryRole
  };
});

