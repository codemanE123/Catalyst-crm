const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

function parseIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!match) {
    return null;
  }

  const octets = match.slice(1).map((value) => Number(value));

  if (octets.some((octet) => octet > 255)) {
    return null;
  }

  return octets;
}

function isBlockedIpv4(octets: number[]) {
  const [a, b] = octets;

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  return false;
}

function isBlockedIpv6(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("fe80:")) {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fec0:") ||
    normalized.startsWith("fed0:")
  ) {
    return true;
  }

  return false;
}

export function assertSafeHttpsUrl(urlString: string): URL {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    throw new SafeFetchError("Invalid URL.");
  }

  if (url.protocol !== "https:") {
    throw new SafeFetchError("Only HTTPS URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new SafeFetchError("URL credentials are not allowed.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0"
  ) {
    throw new SafeFetchError("Localhost URLs are not allowed.");
  }

  const ipv4 = parseIpv4(hostname);

  if (ipv4 && isBlockedIpv4(ipv4)) {
    throw new SafeFetchError("Private or link-local IP addresses are not allowed.");
  }

  if (hostname.includes(":") && isBlockedIpv6(hostname)) {
    throw new SafeFetchError("Private or link-local IP addresses are not allowed.");
  }

  return url;
}

export function isSafeHttpsUrl(urlString: string) {
  try {
    assertSafeHttpsUrl(urlString);
    return true;
  } catch {
    return false;
  }
}

async function readLimitedText(response: Response, maxBytes: number) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    received += value.byteLength;

    if (received > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError("Response exceeded size limit.");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

type SafeFetchTextOptions = {
  headers?: HeadersInit;
  maxBytes?: number;
  timeoutMs?: number;
};

export async function safeFetchText(
  urlString: string,
  options: SafeFetchTextOptions = {}
): Promise<string> {
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let currentUrl = assertSafeHttpsUrl(urlString);
  let redirects = 0;

  while (true) {
    const response = await fetch(currentUrl.toString(), {
      headers: options.headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location || redirects >= MAX_REDIRECTS) {
        throw new SafeFetchError("Unsafe redirect.");
      }

      redirects += 1;
      currentUrl = assertSafeHttpsUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new SafeFetchError(`Request failed with status ${response.status}.`);
    }

    const contentLength = response.headers.get("content-length");

    if (contentLength && Number(contentLength) > maxBytes) {
      throw new SafeFetchError("Response exceeded size limit.");
    }

    return readLimitedText(response, maxBytes);
  }
}

export const SAFE_FETCH_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const SAFE_FETCH_MAX_RESPONSE_BYTES = MAX_RESPONSE_BYTES;
