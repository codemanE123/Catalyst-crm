import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "budget",
  "budget_owner",
  "cookie",
  "cookies",
  "email",
  "form",
  "formdata",
  "notes",
  "objections",
  "password",
  "payload",
  "raw_notes",
  "refresh_token",
  "sb-access-token",
  "sb-refresh-token",
  "session",
  "token",
  "access_token"
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g;
const REDACTED = "[Redacted]";

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();

  if (SENSITIVE_KEYS.has(normalized)) {
    return true;
  }

  return (
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("cookie") ||
    normalized.includes("secret") ||
    normalized.includes("authorization") ||
    normalized.includes("email") ||
    normalized.includes("notes") ||
    normalized.includes("budget") ||
    normalized.includes("payload")
  );
}

export function scrubString(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTED).replace(JWT_PATTERN, REDACTED);
}

type RequestQueryString = NonNullable<ErrorEvent["request"]>["query_string"];

function scrubQueryStringValue(value: unknown): string {
  if (typeof value === "string") {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? scrubString(item) : REDACTED))
      .join(",");
  }

  return REDACTED;
}

export function scrubQueryParams(queryString: RequestQueryString): RequestQueryString {
  if (queryString == null) {
    return queryString;
  }

  if (typeof queryString === "string") {
    return scrubString(queryString);
  }

  if (Array.isArray(queryString)) {
    return queryString.map((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return entry;
      }

      const [key, value] = entry;

      if (isSensitiveKey(String(key))) {
        return [key, REDACTED] as (typeof queryString)[number];
      }

      return [key, scrubQueryStringValue(value)] as (typeof queryString)[number];
    }) as RequestQueryString;
  }

  const scrubbed: Record<string, string> = {};

  for (const [key, value] of Object.entries(queryString)) {
    if (isSensitiveKey(key)) {
      scrubbed[key] = REDACTED;
      continue;
    }

    scrubbed[key] = scrubQueryStringValue(value);
  }

  return scrubbed;
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknown(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return scrubObject(value as Record<string, unknown>, depth + 1);
  }

  return value;
}

function scrubObject(
  object: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(object)) {
    if (isSensitiveKey(key)) {
      scrubbed[key] = REDACTED;
      continue;
    }

    scrubbed[key] = scrubUnknown(value, depth + 1);
  }

  return scrubbed;
}

export function scrubMonitoringEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    const request = { ...event.request } as NonNullable<ErrorEvent["request"]>;

    if (request.headers) {
      const headers = { ...request.headers } as Record<string, string>;
      for (const key of Object.keys(headers)) {
        if (isSensitiveKey(key)) {
          headers[key] = REDACTED;
        } else {
          headers[key] = scrubString(headers[key]);
        }
      }
      request.headers = headers;
    }

    if (request.cookies) {
      request.cookies = Object.fromEntries(
        Object.keys(request.cookies).map((key) => [key, REDACTED])
      );
    }

    if (request.data !== undefined) {
      delete request.data;
    }

    if (request.query_string != null) {
      request.query_string = scrubQueryParams(request.query_string);
    }

    event.request = request;
  }

  if (event.user) {
    event.user = {
      id: event.user.id ? scrubString(String(event.user.id)) : undefined
    };
  }

  if (event.extra) {
    event.extra = scrubObject(event.extra as Record<string, unknown>);
  }

  if (event.contexts) {
    event.contexts = scrubObject(
      event.contexts as Record<string, unknown>
    ) as ErrorEvent["contexts"];
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) =>
      scrubBreadcrumb(breadcrumb)
    );
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      ...exception,
      value: exception.value ? scrubString(exception.value) : exception.value
    }));
  }

  if (event.message) {
    event.message = scrubString(event.message);
  }

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const scrubbed: Breadcrumb = {
    ...breadcrumb,
    message: breadcrumb.message ? scrubString(breadcrumb.message) : breadcrumb.message
  };

  if (breadcrumb.data) {
    scrubbed.data = scrubObject(breadcrumb.data as Record<string, unknown>);
  }

  return scrubbed;
}

export function getSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function isMonitoringEnabled(): boolean {
  return Boolean(getSentryDsn());
}

export function getMonitoringEnvironment(): string {
  if (process.env.SENTRY_ENVIRONMENT) {
    return process.env.SENTRY_ENVIRONMENT;
  }

  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv === "production") {
    return "production";
  }

  if (vercelEnv === "preview") {
    return "staging";
  }

  if (vercelEnv === "development") {
    return "development";
  }

  return process.env.NODE_ENV ?? "development";
}

export function getBaseSentryOptions() {
  return {
    dsn: getSentryDsn(),
    environment: getMonitoringEnvironment(),
    enabled: isMonitoringEnabled(),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubMonitoringEvent,
    beforeBreadcrumb: scrubBreadcrumb
  };
}

export function isMonitoringTestRouteEnabled(): boolean {
  return process.env.SENTRY_ENABLE_TEST_ROUTE === "true";
}
