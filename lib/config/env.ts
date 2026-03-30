function required(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export function getCronSecret() {
  return required("CRON_SECRET");
}

export function getZendeskOauthClientId() {
  return required("ZENDESK_OAUTH_CLIENT_ID");
}

export function getZendeskOauthClientSecret() {
  return required("ZENDESK_OAUTH_CLIENT_SECRET");
}

export function getZendeskOauthScopes() {
  return process.env.ZENDESK_OAUTH_SCOPES?.trim() || "users:read";
}

export function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || null;
}

export function getSlaAlertEmailFrom() {
  return process.env.SLA_ALERT_EMAIL_FROM?.trim() || null;
}

export function getSlaAlertEmailToOverride() {
  return (process.env.SLA_ALERT_EMAIL_TO ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
