import type { SourceQualityClass } from "./types";

/**
 * Classify known public source kinds only. Unknown stays unknown —
 * never invent credibility.
 */
export function classifySourceQuality(input: {
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceKind?: string | null;
}): {
  class: SourceQualityClass;
  score: number | null;
  label: string;
} {
  const kind = (input.sourceKind ?? "").trim().toLowerCase();
  const name = (input.sourceName ?? "").trim().toLowerCase();
  const url = (input.sourceUrl ?? "").trim().toLowerCase();
  const haystack = `${kind} ${name} ${url}`;

  if (
    kind === "official_institutional" ||
    /\.edu\b/.test(url) ||
    /\buniversity\b|\bcollege\b|\bregistrar\b/.test(name)
  ) {
    return {
      class: "official_institutional",
      score: 5,
      label: "Official institutional source"
    };
  }

  if (
    kind === "government_public_dataset" ||
    /\.gov\b/.test(url) ||
    /college scorecard|nces|ipeds|data\.gov/.test(haystack)
  ) {
    return {
      class: "government_public_dataset",
      score: 5,
      label: "Government / public dataset"
    };
  }

  if (
    kind === "recognized_third_party" ||
    /wikipedia|carnegie|peterson|niche\.com/.test(haystack)
  ) {
    return {
      class: "recognized_third_party",
      score: 3,
      label: "Recognized third-party source"
    };
  }

  if (!input.sourceName && !input.sourceUrl && !input.sourceKind) {
    return {
      class: "unknown",
      score: null,
      label: "Unknown / unverified source"
    };
  }

  return {
    class: "unknown",
    score: null,
    label: "Unknown / unverified source"
  };
}
