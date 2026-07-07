import {
  CONTACT_DISCOVERY_ROLE_CATALOG,
  contactDiscoveryOutputSchema,
  type ContactDiscoveryOutput,
  type ContactDiscoveryPublicContext,
  type ContactRecommendation
} from "./types";

const CYBER_KEYWORDS = [
  "cyber",
  "security",
  "stem",
  "engineering",
  "computing",
  "workforce"
];

function contextText(context: ContactDiscoveryPublicContext): string {
  return [
    context.organization_name,
    ...context.school_type_labels,
    ...context.program_keywords
  ]
    .join(" ")
    .toLowerCase();
}

function hasCyberFocus(context: ContactDiscoveryPublicContext): boolean {
  const text = contextText(context);
  return CYBER_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasWorkforceFocus(context: ContactDiscoveryPublicContext): boolean {
  const text = contextText(context);
  return text.includes("workforce") || text.includes("career");
}

function scoreRole(
  roleTitle: string,
  context: ContactDiscoveryPublicContext,
  basePriority: number
): ContactRecommendation | null {
  const cyber = hasCyberFocus(context);
  const workforce = hasWorkforceFocus(context);

  switch (roleTitle) {
    case "Cybersecurity Program Director":
      if (!cyber) {
        return null;
      }
      return {
        recommended_title: roleTitle,
        department: "Cybersecurity / Computing Programs",
        priority: 1,
        rationale:
          "Public program signals suggest cybersecurity or computing alignment. Program leadership is typically the best first institutional contact.",
        suggested_outreach_angle:
          "Lead with cybersecurity workforce pathways, program partnerships, and student career outcomes.",
        confidence_score: 0.88
      };
    case "Workforce Development Director":
      return {
        recommended_title: roleTitle,
        department: "Workforce Development / Continuing Education",
        priority: workforce || cyber ? 1 : 2,
        rationale:
          "Workforce and continuing education leaders often sponsor employer partnership conversations for regional institutions.",
        suggested_outreach_angle:
          "Position the partnership as a workforce development accelerator tied to in-demand skills.",
        confidence_score: workforce ? 0.86 : 0.78
      };
    case "Corporate Partnerships Director":
      return {
        recommended_title: roleTitle,
        department: "Corporate & Community Partnerships",
        priority: 1,
        rationale:
          "Corporate partnerships offices coordinate external employer relationships without requiring a named contact.",
        suggested_outreach_angle:
          "Frame the outreach as a structured partnership exploration for student career pathways.",
        confidence_score: 0.9
      };
    case "Career Services Director":
      return {
        recommended_title: roleTitle,
        department: "Career Services",
        priority: 2,
        rationale:
          "Career services leaders connect employers to students and alumni hiring pipelines.",
        suggested_outreach_angle:
          "Offer collaboration on internships, hiring pipelines, and career readiness programming.",
        confidence_score: 0.84
      };
    case "Dean of Engineering / STEM":
      if (!cyber) {
        return null;
      }
      return {
        recommended_title: roleTitle,
        department: "Engineering / STEM",
        priority: 2,
        rationale:
          "STEM and engineering deans often oversee cybersecurity-related academic units at public institutions.",
        suggested_outreach_angle:
          "Discuss academic-industry collaboration for STEM and cybersecurity talent development.",
        confidence_score: 0.8
      };
    case "CIO":
      return {
        recommended_title: roleTitle,
        department: "Information Technology",
        priority: cyber ? 3 : 4,
        rationale:
          "Technology leadership can sponsor cybersecurity workforce initiatives when digital infrastructure is part of the partnership.",
        suggested_outreach_angle:
          "Highlight secure workforce development and technology-enabled student outcomes.",
        confidence_score: cyber ? 0.74 : 0.62
      };
    case "President":
      return {
        recommended_title: roleTitle,
        department: "Office of the President",
        priority: basePriority,
        rationale:
          "Executive sponsorship may be needed for institution-wide workforce partnerships after a program-level champion is identified.",
        suggested_outreach_angle:
          "Lead with institutional impact, regional workforce outcomes, and student success metrics.",
        confidence_score: 0.68
      };
    case "Provost":
      return {
        recommended_title: roleTitle,
        department: "Academic Affairs",
        priority: basePriority,
        rationale:
          "Academic affairs leadership influences program partnerships that span multiple colleges or schools.",
        suggested_outreach_angle:
          "Discuss academic alignment and scalable partnership models across programs.",
        confidence_score: 0.7
      };
    default:
      return null;
  }
}

export function recommendContactRoles(
  context: ContactDiscoveryPublicContext
): ContactDiscoveryOutput {
  const recommendations: ContactRecommendation[] = [];

  for (const role of CONTACT_DISCOVERY_ROLE_CATALOG) {
    const recommendation = scoreRole(
      role.recommended_title,
      context,
      role.base_priority
    );

    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  recommendations.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return right.confidence_score - left.confidence_score;
  });

  const parsed = contactDiscoveryOutputSchema.safeParse({
    recommendations: recommendations.slice(0, 8)
  });

  if (!parsed.success) {
    return {
      recommendations: [
        {
          recommended_title: "Corporate Partnerships Director",
          department: "Corporate & Community Partnerships",
          priority: 1,
          rationale:
            "Corporate partnerships is a safe default entry point when public program context is limited.",
          suggested_outreach_angle:
            "Request a discovery conversation about employer partnership opportunities.",
          confidence_score: 0.65
        }
      ]
    };
  }

  return parsed.data;
}
