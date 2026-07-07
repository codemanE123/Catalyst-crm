import { z } from "zod";

export const CONTACT_DISCOVERY_TARGET_TYPES = [
  "prospect_candidate",
  "school"
] as const;

export type ContactDiscoveryTargetType =
  (typeof CONTACT_DISCOVERY_TARGET_TYPES)[number];

export const CONTACT_RECOMMENDATION_REVIEW_STATUSES = [
  "pending_review",
  "dismissed"
] as const;

export type ContactRecommendationReviewStatus =
  (typeof CONTACT_RECOMMENDATION_REVIEW_STATUSES)[number];

export const CONTACT_DISCOVERY_ROLE_CATALOG = [
  {
    recommended_title: "President",
    department: "Office of the President",
    base_priority: 3
  },
  {
    recommended_title: "Provost",
    department: "Academic Affairs",
    base_priority: 3
  },
  {
    recommended_title: "CIO",
    department: "Information Technology",
    base_priority: 4
  },
  {
    recommended_title: "Dean of Engineering / STEM",
    department: "Engineering / STEM",
    base_priority: 2
  },
  {
    recommended_title: "Cybersecurity Program Director",
    department: "Cybersecurity / Computing Programs",
    base_priority: 1
  },
  {
    recommended_title: "Workforce Development Director",
    department: "Workforce Development / Continuing Education",
    base_priority: 2
  },
  {
    recommended_title: "Career Services Director",
    department: "Career Services",
    base_priority: 2
  },
  {
    recommended_title: "Corporate Partnerships Director",
    department: "Corporate & Community Partnerships",
    base_priority: 1
  }
] as const;

export const contactDiscoveryPublicContextSchema = z.object({
  organization_name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(32).nullable(),
  school_type_labels: z.array(z.string().trim().min(1).max(80)).max(8),
  program_keywords: z.array(z.string().trim().min(1).max(120)).max(10)
});

export const contactRecommendationSchema = z.object({
  recommended_title: z.string().trim().min(1).max(200),
  department: z.string().trim().min(1).max(200),
  priority: z.number().int().min(1).max(5),
  rationale: z.string().trim().min(20).max(600),
  suggested_outreach_angle: z.string().trim().min(20).max(600),
  confidence_score: z.number().min(0).max(1)
});

export const contactDiscoveryOutputSchema = z.object({
  recommendations: z.array(contactRecommendationSchema).min(1).max(8)
});

export type ContactDiscoveryPublicContext = z.infer<
  typeof contactDiscoveryPublicContextSchema
>;
export type ContactRecommendation = z.infer<typeof contactRecommendationSchema>;
export type ContactDiscoveryOutput = z.infer<typeof contactDiscoveryOutputSchema>;

export type ProspectContactRecommendation = ContactRecommendation & {
  id: string;
  organization_id: string;
  target_type: ContactDiscoveryTargetType;
  target_id: string;
  prospect_candidate_id: string | null;
  school_id: string | null;
  review_status: ContactRecommendationReviewStatus;
  created_at: string;
  updated_at: string;
};

export const CONTACT_DISCOVERY_REVIEW_WARNING =
  "Recommended contact roles are suggestions only. Verify titles on the institution's public website before outreach. Do not create CRM contacts until reviewed.";

export const CONTACT_DISCOVERY_PRIORITY_LABELS: Record<number, string> = {
  1: "Highest",
  2: "High",
  3: "Medium",
  4: "Lower",
  5: "Lowest"
};
