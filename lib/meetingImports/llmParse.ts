import {
  DEFAULT_OPENAI_ENRICHMENT_MODEL,
  OPENAI_CHAT_COMPLETIONS_URL,
  type FetchJsonFn,
  type OpenAiChatCompletionResponse
} from "@/lib/llm/openaiProvider";
import {
  getOpenAiApiKeyFromEnv,
  isLlmEnrichmentEnabledInEnv
} from "@/lib/llm/types";

import {
  MEETING_PARSE_PROMPT_VERSION,
  validateMeetingParseOutput,
  type MeetingParseOutput
} from "./parseDigest";

export function canUseLlmMeetingParse(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isLlmEnrichmentEnabledInEnv(env) && Boolean(getOpenAiApiKeyFromEnv(env));
}

function buildMessages(params: {
  digestText: string;
  meetingTitle: string | null;
}) {
  return [
    {
      role: "system" as const,
      content: [
        "You extract structured CRM fields from a university partnership meeting digest.",
        "Use ONLY information present in the digest. Do not invent emails or names.",
        "If unknown, use null or empty arrays.",
        "Return JSON with keys: meeting_title, meeting_date, summary, attendees,",
        "institution_name, affiliation (school|partner|unknown), contacts,",
        "discovery (pain_points, current_tools, buyer, budget, budget_owner, objections,",
        "pilot_interest High|Medium|Low|None|null, referrals, next_step,",
        "sentiment Strong fit|Warm|Needs nurturing|Not a fit|null),",
        "action_items [{title,owner,due_date}], outreach {subject,outcome},",
        "quotes, risks, possible_student_pii (boolean)."
      ].join(" ")
    },
    {
      role: "user" as const,
      content: [
        `Meeting title hint: ${params.meetingTitle ?? "(none)"}`,
        "",
        "<MEETING_DIGEST>",
        params.digestText.slice(0, 12000),
        "</MEETING_DIGEST>"
      ].join("\n")
    }
  ];
}

export async function parseMeetingDigestWithLlm(params: {
  digestText: string;
  meetingTitle?: string | null;
  env?: NodeJS.ProcessEnv;
  fetchJson?: FetchJsonFn;
}): Promise<
  | { ok: true; data: MeetingParseOutput; model: string }
  | { ok: false; error: string }
> {
  const env = params.env ?? process.env;
  const apiKey = getOpenAiApiKeyFromEnv(env);
  if (!canUseLlmMeetingParse(env) || !apiKey) {
    return { ok: false, error: "LLM meeting parse is not enabled." };
  }

  const fetchJson =
    params.fetchJson ??
    (async <T,>(url: string, init: RequestInit): Promise<T> => {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        throw new Error(`OpenAI request failed with status ${response.status}.`);
      }
      return (await response.json()) as T;
    });

  const model = DEFAULT_OPENAI_ENRICHMENT_MODEL;

  try {
    const response = await fetchJson<OpenAiChatCompletionResponse>(
      OPENAI_CHAT_COMPLETIONS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: buildMessages({
            digestText: params.digestText,
            meetingTitle: params.meetingTitle ?? null
          })
        })
      }
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "OpenAI returned an empty parse response." };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, error: "OpenAI returned invalid JSON." };
    }

    const validated = validateMeetingParseOutput(raw);
    if (!validated.success) {
      return { ok: false, error: validated.error };
    }

    return { ok: true, data: validated.data, model };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "OpenAI meeting parse failed."
    };
  }
}

export { MEETING_PARSE_PROMPT_VERSION };
