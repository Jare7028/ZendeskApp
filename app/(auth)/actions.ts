"use server";

import { redirect } from "next/navigation";

import { getBaseUrl } from "@/lib/config/env";
import { canCreateServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

function buildRedirect(pathname: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `${pathname}?${search.toString()}`;
}

export async function loginAction(formData: FormData) {
  if (!canCreateServerSupabaseClient()) {
    redirect(buildRedirect("/login", { error: "Auth is not configured yet." }));
  }

  const supabase = createServerSupabaseClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(buildRedirect("/login", { error: error.message }));
  }

  redirect("/dashboard");
}

export async function signupAction(formData: FormData) {
  if (!canCreateServerSupabaseClient()) {
    redirect(buildRedirect("/signup", { error: "Auth is not configured yet." }));
  }

  const supabase = createServerSupabaseClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      },
      emailRedirectTo: `${getBaseUrl()}/auth/callback`
    }
  });

  if (error) {
    redirect(buildRedirect("/signup", { error: error.message }));
  }

  if (!data.session) {
    redirect(
      buildRedirect("/login", {
        message: "Check your inbox to confirm your account before signing in."
      })
    );
  }

  redirect("/dashboard");
}

export async function forgotPasswordAction(formData: FormData) {
  if (!canCreateServerSupabaseClient()) {
    redirect(buildRedirect("/forgot-password", { error: "Auth is not configured yet." }));
  }

  const supabase = createServerSupabaseClient();
  const email = String(formData.get("email") ?? "").trim();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getBaseUrl()}/auth/callback?next=/reset-password`
  });

  if (error) {
    redirect(buildRedirect("/forgot-password", { error: error.message }));
  }

  redirect(
    buildRedirect("/forgot-password", {
      message: "Password reset instructions were sent if the account exists."
    })
  );
}

export async function resetPasswordAction(formData: FormData) {
  if (!canCreateServerSupabaseClient()) {
    redirect(buildRedirect("/reset-password", { error: "Auth is not configured yet." }));
  }

  const supabase = createServerSupabaseClient();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    redirect(buildRedirect("/reset-password", { error: "Password must be at least 8 characters." }));
  }

  if (password !== confirmPassword) {
    redirect(buildRedirect("/reset-password", { error: "Passwords do not match." }));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(buildRedirect("/reset-password", { error: error.message }));
  }

  redirect(buildRedirect("/login", { message: "Password updated. Sign in with your new password." }));
}

