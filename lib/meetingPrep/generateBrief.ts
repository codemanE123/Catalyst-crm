import {
  meetingPrepBriefSchema,
  type MeetingPrepBriefContent,
  type MeetingPrepPublicContext
} from "./types";

function hasCyberSignal(context: MeetingPrepPublicContext): boolean {
  const text = [
    context.enrichment_summary,
    context.cyber_programs,
    context.workforce_signals,
    context.outreach_angle
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /cyber|security|stem|workforce|engineering/.test(text);
}

function latestOutreachSummary(context: MeetingPrepPublicContext): string | null {
  const latest = context.outreach_summaries[0];

  if (!latest) {
    return null;
  }

  const parts = [latest.channel, latest.subject, latest.outcome].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function collectKnownObjections(context: MeetingPrepPublicContext): string[] {
  const objections = context.interview_summaries
    .map((summary) => summary.objections?.trim())
    .filter((value): value is string => Boolean(value));

  return [...new Set(objections)].slice(0, 4);
}

export function generateMeetingPrepBrief(
  context: MeetingPrepPublicContext
): MeetingPrepBriefContent {
  const cyber = hasCyberSignal(context);
  const organization = context.organization_name;
  const locationLabel = [context.city, context.state].filter(Boolean).join(", ");
  const statusLabel = context.status ?? "Prospect";
  const contactRoles =
    context.contact_role_titles.length > 0
      ? context.contact_role_titles.slice(0, 4).join(", ")
      : "Corporate Partnerships Director, Career Services Director";
  const latestOutreach = latestOutreachSummary(context);
  const knownObjections = collectKnownObjections(context);

  const keyContext = [
    `${organization} is currently tracked as ${statusLabel}${locationLabel ? ` in ${locationLabel}` : ""}.`,
    context.website ? `Public website: ${context.website}.` : null,
    context.enrichment_summary
      ? `Enrichment summary: ${context.enrichment_summary}`
      : context.cyber_programs
        ? `Program alignment signal: ${context.cyber_programs}`
        : null,
    context.outreach_angle ? `Outreach angle: ${context.outreach_angle}` : null,
    latestOutreach ? `Latest outreach activity: ${latestOutreach}.` : null,
    context.follow_up_summaries[0]
      ? `Open follow-up: ${context.follow_up_summaries[0].title} (${context.follow_up_summaries[0].status}).`
      : null,
    `Suggested entry roles: ${contactRoles}.`
  ].filter((value): value is string => Boolean(value));

  const likelyPriorities = cyber
    ? [
        "Expand cybersecurity and STEM workforce pathways with employer-backed curriculum.",
        "Improve student career outcomes through structured internship and hiring pipelines.",
        "Coordinate partnership ownership across academic and workforce development leaders."
      ]
    : [
        "Identify partnership sponsors for employer engagement and student career readiness.",
        "Clarify institutional priorities for workforce development and corporate collaboration.",
        "Align SecureCell offerings to current outreach stage and relationship maturity."
      ];

  const suggestedQuestions = [
    `Which programs at ${organization} are highest priority for employer partnerships this year?`,
    "Who internally owns corporate partnerships, career services, and workforce development decisions?",
    "What student outcomes or hiring metrics would define a successful first partnership phase?",
    cyber
      ? "How are cybersecurity or STEM pathways currently connected to regional employer demand?"
      : "Which workforce or career readiness initiatives are actively seeking external partners?",
    "What procurement, compliance, or academic approval steps should we plan for before piloting?",
    "What timeline and success criteria would make a discovery follow-up worthwhile for your team?"
  ];

  const recommendedOffering = cyber
    ? "SecureCell workforce partnership focused on cybersecurity talent pipelines, experiential learning, and employer-connected career outcomes."
    : "SecureCell discovery partnership package covering workforce alignment workshops, pilot curriculum integration, and measurable student career pathways.";

  const defaultObjections = [
    "Limited internal bandwidth to launch a new partnership this term.",
    "Need clearer evidence of student outcomes before expanding collaboration.",
    "Budget or procurement timing may delay a formal pilot."
  ];

  const objectionsToPrepareFor =
    knownObjections.length > 0
      ? [...knownObjections, ...defaultObjections.slice(0, 2)]
      : defaultObjections;

  const nextStepRecommendation =
    context.recommended_next_step ??
    (statusLabel === "Prospect"
      ? `Schedule a 30-minute discovery call with ${contactRoles.split(",")[0]?.trim() ?? "partnership leadership"} to validate priorities and confirm decision-makers.`
      : "Confirm meeting attendees, restate the proposed partnership scope, and agree on a pilot evaluation timeline.");

  const confidenceBase = 0.62;
  const confidenceBoost =
    (context.enrichment_summary ? 0.08 : 0) +
    (context.outreach_summaries.length > 0 ? 0.06 : 0) +
    (context.contact_role_titles.length > 0 ? 0.05 : 0) +
    (context.interview_summaries.length > 0 ? 0.07 : 0) +
    (context.confidence_score ?? 0) * 0.12;

  const parsed = meetingPrepBriefSchema.safeParse({
    meeting_objective: `Prepare for a discovery meeting with ${organization} to align SecureCell workforce partnership opportunities, confirm institutional priorities, and define a concrete next step.`,
    key_context: keyContext.slice(0, 8),
    likely_priorities: likelyPriorities,
    suggested_questions: suggestedQuestions.slice(0, 8),
    recommended_securecell_offering: recommendedOffering,
    objections_to_prepare_for: objectionsToPrepareFor.slice(0, 6),
    next_step_recommendation: nextStepRecommendation,
    confidence_score: Math.min(0.95, Number((confidenceBase + confidenceBoost).toFixed(3)))
  });

  if (!parsed.success) {
    return {
      meeting_objective: `Prepare for a discovery meeting with ${organization} and confirm partnership fit.`,
      key_context: keyContext.slice(0, 3),
      likely_priorities: likelyPriorities.slice(0, 2),
      suggested_questions: suggestedQuestions.slice(0, 3),
      recommended_securecell_offering: recommendedOffering,
      objections_to_prepare_for: defaultObjections,
      next_step_recommendation: nextStepRecommendation,
      confidence_score: 0.65
    };
  }

  return parsed.data;
}
