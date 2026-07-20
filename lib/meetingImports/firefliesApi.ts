const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

const TRANSCRIPT_QUERY = `
query Transcript($id: String!) {
  transcript(id: $id) {
    id
    title
    date
    duration
    organizer_email
    participants
    transcript_url
    summary {
      overview
      action_items
    }
    sentences {
      text
      speaker_name
    }
  }
}
`;

export type FirefliesTranscript = {
  id: string;
  title?: string | null;
  date?: number | string | null;
  duration?: number | null;
  organizer_email?: string | null;
  participants?: unknown;
  transcript_url?: string | null;
  summary?: { overview?: string | null; action_items?: string | null } | null;
  sentences?: Array<{ text?: string | null; speaker_name?: string | null }>;
};

export async function fetchFirefliesTranscript(params: {
  apiKey: string;
  meetingId: string;
  fetchImpl?: typeof fetch;
}): Promise<FirefliesTranscript | null> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify({
      query: TRANSCRIPT_QUERY,
      variables: { id: params.meetingId }
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    data?: { transcript?: FirefliesTranscript | null };
    errors?: unknown;
  };

  return payload.data?.transcript ?? null;
}
