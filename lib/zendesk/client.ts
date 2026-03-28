import "server-only";

type ZendeskCredentialType = "api_token" | "oauth_token";

export type ZendeskConnectionCredentials = {
  subdomain: string;
  credentialType: ZendeskCredentialType;
  accessToken: string;
  apiUserEmail: string | null;
};

type CursorMeta = {
  has_more?: boolean;
  after_cursor?: string | null;
};

type ZendeskPageResponse<T> = {
  records: T[];
  afterCursor: string | null;
  hasMore: boolean;
  headers: ZendeskRateLimitSnapshot;
};

export type ZendeskRateLimitSnapshot = {
  accountLimit: number | null;
  accountRemaining: number | null;
  accountResetSeconds: number | null;
  endpointName: string | null;
  endpointLimit: number | null;
  endpointRemaining: number | null;
  endpointResetSeconds: number | null;
};

export type ZendeskTicketRecord = {
  id: number;
  subject: string | null;
  status: string | null;
  priority: string | null;
  via?: {
    channel?: string | null;
    source?: {
      from?: Record<string, unknown>;
      to?: Record<string, unknown>;
      rel?: string | null;
    } | null;
  } | null;
  requester?: {
    email?: string | null;
  } | null;
  requester_id?: number | null;
  assignee_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ZendeskTicketMetricRecord = {
  id?: number;
  ticket_id: number;
  reply_time_in_minutes?: { calendar?: number | null } | null;
  full_resolution_time_in_minutes?: { calendar?: number | null } | null;
  agent_wait_time_in_minutes?: { calendar?: number | null } | null;
  requester_wait_time_in_minutes?: { calendar?: number | null } | null;
  on_hold_time_in_minutes?: { calendar?: number | null } | null;
  group_stations?: number | null;
  reassignment_count?: number | null;
  replies?: number | null;
  solved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ZendeskUserRecord = {
  id: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  suspended?: boolean | null;
  active?: boolean | null;
  last_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_429_RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEndpointRateLimit(header: string | null): Pick<
  ZendeskRateLimitSnapshot,
  "endpointName" | "endpointLimit" | "endpointRemaining" | "endpointResetSeconds"
> {
  if (!header) {
    return {
      endpointName: null,
      endpointLimit: null,
      endpointRemaining: null,
      endpointResetSeconds: null
    };
  }

  const [endpointName, ...parts] = header.split(":");
  const parsed = Object.fromEntries(
    parts
      .join(":")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, value] = part.split("=");
        return [key, value];
      })
  );

  return {
    endpointName: endpointName?.trim() ?? null,
    endpointLimit: toNumber(parsed.total ?? null),
    endpointRemaining: toNumber(parsed.remaining ?? null),
    endpointResetSeconds: toNumber(parsed.resets ?? null)
  };
}

function parseRateLimitHeaders(headers: Headers): ZendeskRateLimitSnapshot {
  const endpointHeader =
    headers
      .entries()
      .find(([key]) => key.toLowerCase().startsWith("zendesk-ratelimit-"))?.[1] ?? null;
  const endpointSnapshot = parseEndpointRateLimit(endpointHeader);

  return {
    accountLimit: toNumber(headers.get("x-rate-limit") ?? headers.get("ratelimit-limit")),
    accountRemaining: toNumber(headers.get("x-rate-limit-remaining") ?? headers.get("ratelimit-remaining")),
    accountResetSeconds: toNumber(headers.get("ratelimit-reset")),
    ...endpointSnapshot
  };
}

function parseRetryAfter(headers: Headers) {
  return Math.max(1, toNumber(headers.get("retry-after")) ?? 1) * 1000;
}

function buildAuthHeader(credentials: ZendeskConnectionCredentials) {
  if (credentials.credentialType === "oauth_token") {
    return `Bearer ${credentials.accessToken}`;
  }

  if (!credentials.apiUserEmail) {
    throw new Error("Zendesk API token connections require api_user_email.");
  }

  return `Basic ${Buffer.from(`${credentials.apiUserEmail}/token:${credentials.accessToken}`).toString("base64")}`;
}

export class ZendeskClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private nextRequestAt = 0;

  constructor(private readonly credentials: ZendeskConnectionCredentials) {
    this.baseUrl = `https://${credentials.subdomain}.zendesk.com/api/v2`;
    this.authorization = buildAuthHeader(credentials);
  }

  async listTickets(options: {
    afterCursor?: string | null;
    pageSize?: number;
    sort?: string;
    startTime?: number | null;
  }): Promise<ZendeskPageResponse<ZendeskTicketRecord>> {
    return this.listResource<ZendeskTicketRecord>({
      path: "/tickets",
      key: "tickets",
      query: {
        "page[size]": String(options.pageSize ?? DEFAULT_PAGE_SIZE),
        ...(options.afterCursor ? { "page[after]": options.afterCursor } : {}),
        ...(options.sort ? { sort: options.sort } : {}),
        ...(options.startTime ? { start_time: String(options.startTime) } : {})
      }
    });
  }

  async listTicketMetrics(options: {
    afterCursor?: string | null;
    pageSize?: number;
    sort?: string;
  }): Promise<ZendeskPageResponse<ZendeskTicketMetricRecord>> {
    return this.listResource<ZendeskTicketMetricRecord>({
      path: "/ticket_metrics",
      key: "ticket_metrics",
      query: {
        "page[size]": String(options.pageSize ?? DEFAULT_PAGE_SIZE),
        ...(options.afterCursor ? { "page[after]": options.afterCursor } : {}),
        ...(options.sort ? { sort: options.sort } : {})
      }
    });
  }

  async listAgentUsers(options: {
    afterCursor?: string | null;
    pageSize?: number;
    sort?: string;
  }): Promise<ZendeskPageResponse<ZendeskUserRecord>> {
    return this.listResource<ZendeskUserRecord>({
      path: "/users",
      key: "users",
      query: {
        role: "agent",
        "page[size]": String(options.pageSize ?? DEFAULT_PAGE_SIZE),
        ...(options.afterCursor ? { "page[after]": options.afterCursor } : {}),
        ...(options.sort ? { sort: options.sort } : {})
      }
    });
  }

  async getCurrentUser(): Promise<ZendeskUserRecord | null> {
    const response = await this.request(new URL(`${this.baseUrl}/users/me.json`));
    const payload = (await response.json()) as { user?: ZendeskUserRecord | null };
    return payload.user ?? null;
  }

  private async listResource<T>(options: {
    path: string;
    key: string;
    query: Record<string, string>;
  }): Promise<ZendeskPageResponse<T>> {
    const url = new URL(`${this.baseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }

    const response = await this.request(url);
    const payload = (await response.json()) as Record<string, unknown>;
    const meta = (payload.meta ?? {}) as CursorMeta;

    return {
      records: Array.isArray(payload[options.key]) ? (payload[options.key] as T[]) : [],
      afterCursor: meta.after_cursor ?? null,
      hasMore: Boolean(meta.has_more),
      headers: parseRateLimitHeaders(response.headers)
    };
  }

  private async request(url: URL, attempt = 0): Promise<Response> {
    const now = Date.now();
    if (this.nextRequestAt > now) {
      await sleep(this.nextRequestAt - now);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    if (response.status === 429) {
      if (attempt >= MAX_429_RETRIES) {
        throw new Error(`Zendesk rate limit persisted after ${MAX_429_RETRIES + 1} attempts.`);
      }

      const retryAfterMs = parseRetryAfter(response.headers);
      this.nextRequestAt = Date.now() + retryAfterMs;
      await sleep(retryAfterMs);
      return this.request(url, attempt + 1);
    }

    if (!response.ok) {
      throw new Error(`Zendesk request failed with status ${response.status} for ${url.pathname}.`);
    }

    const rateLimits = parseRateLimitHeaders(response.headers);
    const waitSecondsCandidates = [rateLimits.accountResetSeconds, rateLimits.endpointResetSeconds].filter(
      (value): value is number => typeof value === "number" && value > 0
    );
    const remainingCandidates = [rateLimits.accountRemaining, rateLimits.endpointRemaining].filter(
      (value): value is number => typeof value === "number"
    );

    const lowestRemaining = remainingCandidates.length > 0 ? Math.min(...remainingCandidates) : null;
    if (lowestRemaining !== null && lowestRemaining <= 1 && waitSecondsCandidates.length > 0) {
      this.nextRequestAt = Date.now() + Math.max(...waitSecondsCandidates) * 1000;
    } else {
      this.nextRequestAt = 0;
    }

    return response;
  }
}
