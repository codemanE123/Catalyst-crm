import { SafeFetchError, safeFetchText } from "@/lib/safeFetch";

import type {
  WebSearchProvider,
  WebSearchQueryResult,
  WebSearchResult
} from "./webSearchTypes";

const GOOGLE_CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

export class WebSearchProviderError extends Error {
  readonly code:
    | "not_configured"
    | "provider_error"
    | "rate_limited"
    | "invalid_response"
    | "timeout";

  constructor(
    code: WebSearchProviderError["code"],
    message: string
  ) {
    super(message);
    this.name = "WebSearchProviderError";
    this.code = code;
  }
}

function mapGoogleItems(payload: unknown): WebSearchResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const results: WebSearchResult[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as {
      title?: unknown;
      link?: unknown;
      snippet?: unknown;
    };
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const url = typeof row.link === "string" ? row.link.trim() : "";
    const snippet = typeof row.snippet === "string" ? row.snippet.trim() : "";
    if (!title || !url) {
      continue;
    }
    results.push({ title, url, snippet });
  }
  return results;
}

export const googleCseWebSearchProvider: WebSearchProvider = {
  id: "google_cse",

  async search(params): Promise<WebSearchQueryResult> {
    const fetchText = params.fetchText ?? safeFetchText;
    const num = Math.min(10, Math.max(1, params.maxResults));
    const url = new URL(GOOGLE_CSE_ENDPOINT);
    url.searchParams.set("key", params.apiKey);
    url.searchParams.set("cx", params.engineId);
    url.searchParams.set("q", params.query);
    url.searchParams.set("num", String(num));

    try {
      const responseText = await fetchText(url.toString(), {
        timeoutMs: params.timeoutMs
      });
      const payload = JSON.parse(responseText) as unknown;
      return {
        query: params.query,
        results: mapGoogleItems(payload).slice(0, num),
        provider: "google_cse",
        request_count: 1
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new WebSearchProviderError(
          "invalid_response",
          "Web search returned an invalid response."
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/status 429/i.test(message)) {
        throw new WebSearchProviderError(
          "rate_limited",
          "Web search rate limit reached."
        );
      }
      if (/timeout|aborted/i.test(message)) {
        throw new WebSearchProviderError(
          "timeout",
          "Web search request timed out."
        );
      }
      if (error instanceof SafeFetchError) {
        throw new WebSearchProviderError(
          "provider_error",
          "Could not retrieve web search results."
        );
      }
      throw new WebSearchProviderError(
        "provider_error",
        "Could not retrieve web search results."
      );
    }
  }
};

export function resolveWebSearchProvider(
  providerId: string
): WebSearchProvider | null {
  if (providerId === "google_cse") {
    return googleCseWebSearchProvider;
  }
  return null;
}
