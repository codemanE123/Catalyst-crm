import {
  proposalDraftContentSchema,
  type ProposalDraftContent,
  type ProposalGenerationPublicContext
} from "./types";

function hasCyberFocus(context: ProposalGenerationPublicContext): boolean {
  const text = [
    context.enrichment_summary,
    context.outreach_angle,
    context.public_institutional_context,
    context.meeting_prep_summary?.recommended_offering
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /cyber|security|stem|workforce|engineering/.test(text);
}

export function generateProposalDraft(
  context: ProposalGenerationPublicContext
): ProposalDraftContent {
  const organization = context.organization_name;
  const locationLabel = [context.city, context.state].filter(Boolean).join(", ");
  const cyber = hasCyberFocus(context);
  const statusLabel = context.status ?? "Prospect";
  const offering =
    context.meeting_prep_summary?.recommended_offering ??
    (cyber
      ? "SecureCell cybersecurity workforce partnership"
      : "SecureCell employer partnership program");
  const nextStepSeed =
    context.meeting_prep_summary?.next_step_recommendation ??
    context.recommended_next_step ??
    "Schedule a partnership scoping session with institutional stakeholders.";

  const proposedProgram = cyber
    ? `${offering}: cybersecurity workforce pathway partnership combining employer-backed curriculum, experiential learning, and career placement support.`
    : `${offering} connecting students to regional employer demand through structured programming and career readiness support.`;

  const targetAudience = cyber
    ? "STEM and cybersecurity students, career changers in workforce programs, and employer partners seeking regional talent pipelines."
    : "Students in career-focused programs, workforce development participants, and institutional leaders sponsoring employer partnerships.";

  const implementationPlan = [
    "Discovery and stakeholder alignment workshop with academic and workforce leadership.",
    "Co-design partnership scope, program milestones, and success metrics.",
    "Pilot curriculum integration or workforce module deployment with faculty champions.",
    "Launch employer engagement sessions, internships, and hiring pipeline activities.",
    "Review pilot outcomes and define scale-up or renewal plan."
  ];

  const successMetrics = [
    "Number of students completing partnership pathway modules.",
    "Internship or interview placements secured through employer network.",
    "Employer satisfaction and repeat engagement rate.",
    "Institutional reporting on workforce outcomes and career readiness improvements."
  ];

  const timeline = cyber
    ? "Phase 1 discovery (2–3 weeks), pilot design (4–6 weeks), pilot launch (1 semester), evaluation and scale decision (week 12–16)."
    : "Phase 1 discovery (2–4 weeks), partnership design (4 weeks), pilot launch (8–12 weeks), review and expansion planning (week 16).";

  const pricingRange = cyber
    ? "$45,000–$95,000 annual partnership range depending on pilot scope, cohort size, and employer engagement depth."
    : "$35,000–$75,000 annual partnership range depending on program integration level and support services.";

  const nextSteps = [
    nextStepSeed,
    "Confirm decision-makers and procurement path for a formal pilot proposal.",
    "Align on success metrics and reporting cadence before external sharing.",
    "Review this internal draft with legal and leadership before sending to the institution."
  ];

  const executiveSummaryParts = [
    `${organization}${locationLabel ? ` (${locationLabel})` : ""} is positioned for a SecureCell partnership focused on workforce-ready student outcomes.`,
    context.enrichment_summary
      ? `Public enrichment signals: ${context.enrichment_summary}`
      : context.public_institutional_context
        ? `Institutional context: ${context.public_institutional_context}`
        : null,
    context.outreach_angle ? `Outreach angle: ${context.outreach_angle}` : null,
    context.meeting_prep_summary?.meeting_objective
      ? `Meeting objective: ${context.meeting_prep_summary.meeting_objective}`
      : null,
    `Current CRM status: ${statusLabel}.`
  ].filter(Boolean);

  const confidenceBase = 0.6;
  const confidenceBoost =
    (context.enrichment_summary ? 0.07 : 0) +
    (context.meeting_prep_summary ? 0.1 : 0) +
    (context.outreach_angle ? 0.05 : 0) +
    (context.public_institutional_context ? 0.05 : 0) +
    (context.fit_score ?? 0) * 0.1;

  const parsed = proposalDraftContentSchema.safeParse({
    proposal_title: `${organization} × SecureCell Partnership Proposal (Draft)`,
    executive_summary: executiveSummaryParts.join(" "),
    proposed_program: proposedProgram,
    target_audience: targetAudience,
    implementation_plan: implementationPlan,
    timeline,
    success_metrics: successMetrics,
    recommended_pricing_range: pricingRange,
    next_steps: nextSteps,
    confidence_score: Math.min(0.94, Number((confidenceBase + confidenceBoost).toFixed(3)))
  });

  if (!parsed.success) {
    return {
      proposal_title: `${organization} × SecureCell Partnership Proposal (Draft)`,
      executive_summary: `Draft partnership proposal for ${organization} based on available public and CRM context.`,
      proposed_program: proposedProgram,
      target_audience: targetAudience,
      implementation_plan: implementationPlan.slice(0, 3),
      timeline,
      success_metrics: successMetrics.slice(0, 2),
      recommended_pricing_range: pricingRange,
      next_steps: nextSteps.slice(0, 2),
      confidence_score: 0.65
    };
  }

  return parsed.data;
}
