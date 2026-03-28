import "server-only";

export type ConnecteamMeResponse = {
  accountId?: string | number | null;
  id?: string | number | null;
  name?: string | null;
  companyName?: string | null;
  email?: string | null;
  timezone?: string | null;
  country?: string | null;
  [key: string]: unknown;
};

export type ConnecteamUserRecord = {
  id?: string | number | null;
  userId?: string | number | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type ConnecteamSchedulerRecord = {
  id?: string | number | null;
  schedulerId?: string | number | null;
  name?: string | null;
  title?: string | null;
  [key: string]: unknown;
};

export type ConnecteamShiftRecord = {
  id?: string | number | null;
  shiftId?: string | number | null;
  userId?: string | number | null;
  startDate?: string | null;
  endDate?: string | null;
  [key: string]: unknown;
};

type ConnecteamPageEnvelope<T> = {
  items: T[];
  total: number | null;
  limit: number | null;
  offset: number;
  hasMore: boolean;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 4;
const BASE_URL = "https://api.connecteam.com";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as T[];
    }
  }

  const nestedData = asRecord(record.data);
  if (nestedData) {
    for (const key of keys) {
      if (Array.isArray(nestedData[key])) {
        return nestedData[key] as T[];
      }
    }
  }

  return [];
}

function parsePageEnvelope<T>(payload: unknown, keys: string[], requestedLimit: number, requestedOffset: number) {
  const record = asRecord(payload);
  const items = readArray<T>(payload, keys);
  const pagination = asRecord(record?.pagination) ?? asRecord(record?.meta) ?? asRecord(asRecord(record?.data)?.pagination);
  const total = toNumber(
    pagination?.total ?? record?.total ?? asRecord(record?.data)?.total ?? (Array.isArray(payload) ? items.length : null)
  );
  const limit = toNumber(
    pagination?.limit ?? record?.limit ?? asRecord(record?.data)?.limit ?? requestedLimit
  );
  const offset =
    toNumber(pagination?.offset ?? record?.offset ?? asRecord(record?.data)?.offset ?? requestedOffset) ?? requestedOffset;
  const nextOffset = toNumber(
    pagination?.nextOffset ?? record?.nextOffset ?? asRecord(record?.data)?.nextOffset
  );
  const hasMore =
    typeof pagination?.hasMore === "boolean"
      ? pagination.hasMore
      : typeof record?.hasMore === "boolean"
        ? (record.hasMore as boolean)
        : nextOffset !== null
          ? nextOffset > offset
          : total !== null
            ? offset + items.length < total
            : items.length === requestedLimit;

  return {
    items,
    total,
    limit,
    offset,
    hasMore
  } satisfies ConnecteamPageEnvelope<T>;
}

function parseRetryDelayMs(headers: Headers, attempt: number) {
  const retryAfter = headers.get("retry-after");
  const retrySeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return retrySeconds * 1000;
  }

  return Math.min(1000 * 2 ** attempt, 8000);
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("Connecteam returned a non-JSON response.");
    }
  }

  return body as T;
}

function unwrapObject(payload: unknown) {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const nestedData = asRecord(record.data);
  return nestedData ?? record;
}

export class ConnecteamClient {
  private nextRequestAt = 0;

  constructor(private readonly apiKey: string) {}

  async getMe() {
    const response = await this.request("/me");
    const payload = await readJsonOrThrow<unknown>(response);
    return (unwrapObject(payload) ?? {}) as ConnecteamMeResponse;
  }

  async listUsers(options?: { limit?: number; offset?: number }) {
    const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
    const offset = options?.offset ?? 0;
    const response = await this.request("/users/v1/users", { limit, offset });
    const payload = await readJsonOrThrow<unknown>(response);
    return parsePageEnvelope<ConnecteamUserRecord>(payload, ["users", "items", "results"], limit, offset);
  }

  async listSchedulers(options?: { limit?: number; offset?: number }) {
    const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
    const offset = options?.offset ?? 0;
    const response = await this.request("/scheduler/v1/schedulers", { limit, offset });
    const payload = await readJsonOrThrow<unknown>(response);
    return parsePageEnvelope<ConnecteamSchedulerRecord>(payload, ["schedulers", "items", "results"], limit, offset);
  }

  async listSchedulerShifts(
    schedulerId: string | number,
    options?: { limit?: number; offset?: number; startDate?: string; endDate?: string }
  ) {
    const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
    const offset = options?.offset ?? 0;
    const response = await this.request(`/scheduler/v1/schedulers/${encodeURIComponent(String(schedulerId))}/shifts`, {
      limit,
      offset,
      ...(options?.startDate ? { startDate: options.startDate } : {}),
      ...(options?.endDate ? { endDate: options.endDate } : {})
    });
    const payload = await readJsonOrThrow<unknown>(response);
    return parsePageEnvelope<ConnecteamShiftRecord>(payload, ["shifts", "items", "results"], limit, offset);
  }

  async listAllUsers(options?: { pageSize?: number }) {
    return this.collectPages<ConnecteamUserRecord>((offset, limit) => this.listUsers({ offset, limit }), options?.pageSize);
  }

  async listAllSchedulers(options?: { pageSize?: number }) {
    return this.collectPages<ConnecteamSchedulerRecord>(
      (offset, limit) => this.listSchedulers({ offset, limit }),
      options?.pageSize
    );
  }

  async listAllSchedulerShifts(
    schedulerId: string | number,
    options?: { pageSize?: number; startDate?: string; endDate?: string }
  ) {
    return this.collectPages<ConnecteamShiftRecord>(
      (offset, limit) =>
        this.listSchedulerShifts(schedulerId, {
          offset,
          limit,
          startDate: options?.startDate,
          endDate: options?.endDate
        }),
      options?.pageSize
    );
  }

  private async collectPages<T>(
    fetchPage: (offset: number, limit: number) => Promise<ConnecteamPageEnvelope<T>>,
    pageSize = DEFAULT_PAGE_SIZE
  ) {
    let offset = 0;
    const items: T[] = [];

    while (true) {
      const page = await fetchPage(offset, pageSize);
      items.push(...page.items);

      if (!page.hasMore) {
        break;
      }

      offset = page.offset + page.items.length;
    }

    return items;
  }

  private async request(path: string, query?: Record<string, string | number>, attempt = 0): Promise<Response> {
    const now = Date.now();
    if (this.nextRequestAt > now) {
      await sleep(this.nextRequestAt - now);
    }

    const url = new URL(path, BASE_URL);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-KEY": this.apiKey
      },
      cache: "no-store"
    });

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const delayMs = parseRetryDelayMs(response.headers, attempt);
      this.nextRequestAt = Date.now() + delayMs;
      await sleep(delayMs);
      return this.request(path, query, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Connecteam request failed with status ${response.status}.`);
    }

    return response;
  }
}
