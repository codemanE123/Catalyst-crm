export type WebSearchProviderId = "google_cse";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchQueryResult = {
  query: string;
  results: WebSearchResult[];
  provider: WebSearchProviderId;
  request_count: number;
};

export type WebSearchProvider = {
  readonly id: WebSearchProviderId;
  search(params: {
    query: string;
    maxResults: number;
    apiKey: string;
    engineId: string;
    timeoutMs: number;
    fetchText?: (
      url: string,
      opts?: { timeoutMs?: number }
    ) => Promise<string>;
  }): Promise<WebSearchQueryResult>;
};
