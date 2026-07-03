import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "./supabaseServer";

export type School = {
  id: string;
  name: string;
  district: string;
  location: string;
  status: "Prospect" | "Contacted" | "Interviewing" | "Partner";
  owner: string;
  next_step: string;
  notes?: string | null;
  website?: string | null;
  enrollment?: string | null;
  public_private?: "Public" | "Private" | "Unknown" | null;
  hbcu?: boolean | null;
  community_college?: boolean | null;
  state?: string | null;
  ai_programs?: string | null;
  cyber_programs?: string | null;
  healthcare_programs?: string | null;
  innovation_center?: string | null;
  entrepreneurship_center?: string | null;
  career_services_office?: string | null;
  workforce_development_office?: string | null;
  profile_sources?: string[] | null;
};

export type Contact = {
  id: string;
  name: string;
  role: string;
  school: string;
  email: string;
  last_touch: string;
  relationship: "New" | "Warm" | "Champion" | "Needs follow-up";
};

export type SchoolContact = Contact & {
  phone: string | null;
  notes: string | null;
};

export type OutreachActivity = {
  id: string;
  channel: "Email" | "Call" | "Meeting" | "LinkedIn" | "Event" | "Other";
  subject: string | null;
  message: string | null;
  outcome: string | null;
  outreach_date: string;
  owner: string | null;
  next_step: string | null;
};

export type InterviewSummary = {
  id: string;
  interviewer: string;
  interview_date: string;
  sentiment: "Strong fit" | "Warm" | "Needs nurturing" | "Not a fit";
  notes: string;
  follow_up: string | null;
  raw_notes: string | null;
  pain_points: string | null;
  current_tools: string | null;
  buyer: string | null;
  budget: string | null;
  budget_owner: string | null;
  objections: string | null;
  pilot_interest: "High" | "Medium" | "Low" | "None" | null;
  referrals: string | null;
  next_step: string | null;
};

export type FollowUp = {
  id: string;
  title: string;
  due_date: string | null;
  status: "Open" | "Scheduled" | "Done" | "Blocked";
  owner: string | null;
  notes: string | null;
};

export type PipelineStage = {
  name: string;
  count: number;
  color: string;
};

export type CeoMetric = {
  label: string;
  value: number;
  detail: string;
};

export type DashboardData = {
  schools: School[];
  contacts: Contact[];
  pipeline: PipelineStage[];
  ceoMetrics: CeoMetric[];
  source: "supabase" | "sample";
};

export type SchoolProfileData = {
  school: School;
  contacts: SchoolContact[];
  outreach: OutreachActivity[];
  interviews: InterviewSummary[];
  nextFollowUp: FollowUp | null;
  source: "supabase" | "sample";
};

type ContactRow = Omit<Contact, "school"> & {
  schools:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

function getRelatedSchoolName(schools: ContactRow["schools"]) {
  if (Array.isArray(schools)) {
    return schools[0]?.name ?? "Unassigned school";
  }

  return schools?.name ?? "Unassigned school";
}

const sampleSchools: School[] = [
  {
    id: "school-1",
    name: "Roosevelt High School",
    district: "Oak Valley USD",
    location: "Oak Valley, CA",
    status: "Interviewing",
    owner: "Maya Chen",
    next_step: "Principal interview on Friday",
    website: "https://www.roosevelths.example.edu",
    notes:
      "Best near-term fit because the leadership team has urgent senior advising needs."
  },
  {
    id: "school-2",
    name: "North Star Academy",
    district: "Metro Charter Network",
    location: "Denver, CO",
    status: "Contacted",
    owner: "Jon Bell",
    next_step: "Send program overview",
    website: "https://www.northstar.example.edu",
    notes: "Needs district approval before a pilot can be scoped."
  },
  {
    id: "school-3",
    name: "Lakeview Middle School",
    district: "Lakeview Schools",
    location: "Madison, WI",
    status: "Prospect",
    owner: "Priya Shah",
    next_step: "Find counseling lead",
    website: "https://www.lakeview.example.edu",
    notes: "Early research account with no confirmed buyer yet."
  },
  {
    id: "school-4",
    name: "Cedar Ridge Prep",
    district: "Independent",
    location: "Austin, TX",
    status: "Partner",
    owner: "Maya Chen",
    next_step: "Quarterly success review",
    website: "https://www.cedarridge.example.edu",
    notes: "Existing partner ready for expansion discussion."
  }
];

const sampleContacts: Contact[] = [
  {
    id: "contact-1",
    name: "Dr. Elaine Foster",
    role: "Principal",
    school: "Roosevelt High School",
    email: "elaine.foster@example.edu",
    last_touch: "2026-07-01",
    relationship: "Champion"
  },
  {
    id: "contact-2",
    name: "Marcus Lee",
    role: "College Counselor",
    school: "North Star Academy",
    email: "marcus.lee@example.edu",
    last_touch: "2026-06-28",
    relationship: "Warm"
  },
  {
    id: "contact-3",
    name: "Ana Morales",
    role: "Assistant Principal",
    school: "Lakeview Middle School",
    email: "ana.morales@example.edu",
    last_touch: "2026-06-20",
    relationship: "Needs follow-up"
  }
];

const sampleSchoolContacts: SchoolContact[] = [
  {
    ...sampleContacts[0],
    phone: "(555) 014-0188",
    notes: "Champion for a small senior pilot and wants counselor workflow details."
  },
  {
    id: "contact-4",
    name: "Renee Jackson",
    role: "Dean of Students",
    school: "Roosevelt High School",
    email: "renee.jackson@example.edu",
    last_touch: "2026-06-26",
    relationship: "Warm",
    phone: "(555) 014-0192",
    notes: "Asked for parent communication examples and implementation timeline."
  },
  {
    ...sampleContacts[1],
    phone: "(555) 014-0104",
    notes: "Interested in college counseling outcomes and student onboarding."
  },
  {
    ...sampleContacts[2],
    phone: "(555) 014-0127",
    notes: "Needs follow-up after summer planning cycle."
  }
];

const sampleOutreach: (OutreachActivity & { school_id: string })[] = [
  {
    id: "outreach-1",
    school_id: "school-1",
    channel: "Email",
    subject: "Pilot overview for Roosevelt",
    message: "Shared the first cohort overview and implementation checklist.",
    outcome: "Reply received from principal",
    outreach_date: "2026-06-24",
    owner: "Maya Chen",
    next_step: "Book counselor discovery call"
  },
  {
    id: "outreach-2",
    school_id: "school-1",
    channel: "Meeting",
    subject: "Principal discovery",
    message: "Discussed senior advising gaps and staff capacity.",
    outcome: "Strong interest in pilot",
    outreach_date: "2026-07-01",
    owner: "Maya Chen",
    next_step: "Send pilot plan"
  },
  {
    id: "outreach-3",
    school_id: "school-2",
    channel: "Email",
    subject: "Program overview",
    message: "Sent deck and outcomes summary.",
    outcome: "Awaiting reply",
    outreach_date: "2026-06-28",
    owner: "Jon Bell",
    next_step: "Follow up next week"
  }
];

const sampleInterviews: (InterviewSummary & { school_id: string })[] = [
  {
    id: "interview-1",
    school_id: "school-1",
    interviewer: "Maya Chen",
    interview_date: "2026-07-01",
    sentiment: "Strong fit",
    notes:
      "Roosevelt needs lightweight support for first-generation college planning and wants a pilot that does not add counselor admin load.",
    follow_up: "Send pilot plan with counselor workflow",
    raw_notes:
      "Counselors are stretched thin and need better support for first-generation college planning. Principal and counseling director approve pilot spend. Budget can come from college readiness funds. Concern is counselor admin lift. Strong fit for a fall pilot. Next step is sending the pilot plan.",
    pain_points:
      "Counselors are stretched thin and need better support for first-generation college planning.",
    current_tools: "Shared spreadsheets, email reminders, and one-off counselor meetings.",
    buyer: "Principal and college counseling director",
    budget: "College readiness funds",
    budget_owner: "Principal and college counseling director",
    objections: "Needs proof that the pilot will not increase counselor admin work.",
    pilot_interest: "High",
    referrals: "Suggested speaking with the senior seminar teacher.",
    next_step: "Send pilot plan with counselor workflow"
  },
  {
    id: "interview-2",
    school_id: "school-2",
    interviewer: "Jon Bell",
    interview_date: "2026-06-30",
    sentiment: "Warm",
    notes:
      "North Star is interested but needs district approval before committing to a pilot.",
    follow_up: "Share procurement language",
    raw_notes:
      "North Star is interested but district approval is unclear. The charter network operations lead is the buyer and budget owner. They use a counseling CRM and district email campaigns. Procurement is the main objection. Next step is sharing procurement language.",
    pain_points: "Approval path and student onboarding capacity are unclear.",
    current_tools: "Counseling CRM and district email campaigns.",
    buyer: "Charter network operations lead",
    budget: "Network operations budget",
    budget_owner: "Charter network operations lead",
    objections: "Needs district procurement guidance.",
    pilot_interest: "Medium",
    referrals: "Operations lead at the charter network.",
    next_step: "Share procurement language"
  }
];

const sampleFollowUps: (FollowUp & { school_id: string })[] = [
  {
    id: "follow-up-1",
    school_id: "school-1",
    title: "Send Roosevelt pilot plan",
    due_date: "2026-07-05",
    status: "Open",
    owner: "Maya Chen",
    notes: "Include scope, timeline, staff lift, and success measures."
  },
  {
    id: "follow-up-2",
    school_id: "school-2",
    title: "Follow up on program overview",
    due_date: "2026-07-08",
    status: "Scheduled",
    owner: "Jon Bell",
    notes: "Ask whether district approval path is clear."
  }
];

const sampleCeoMetrics: CeoMetric[] = [
  { label: "Schools added", value: 42, detail: "Total target accounts" },
  { label: "Emails sent", value: 318, detail: "Outbound school emails" },
  { label: "Replies", value: 86, detail: "Positive or neutral responses" },
  { label: "Interviews booked", value: 24, detail: "Scheduled discovery calls" },
  { label: "Interviews completed", value: 17, detail: "Completed school interviews" },
  { label: "Pilot interest", value: 11, detail: "Schools showing strong fit" },
  { label: "LOIs", value: 5, detail: "Letters of intent in motion" },
  { label: "Paid pilots", value: 2, detail: "Converted pilot partners" }
];

async function getSupabaseClient(): Promise<SupabaseClient | null> {
  return getServerSupabaseClient();
}

function buildPipeline(schools: School[]): PipelineStage[] {
  const stages: PipelineStage[] = [
    { name: "Prospect", count: 0, color: "bg-slate-400" },
    { name: "Contacted", count: 0, color: "bg-sky-500" },
    { name: "Interviewing", count: 0, color: "bg-amber-500" },
    { name: "Partner", count: 0, color: "bg-emerald-500" }
  ];

  return stages.map((stage) => ({
    ...stage,
    count: schools.filter((school) => school.status === stage.name).length
  }));
}

function countOrZero(count: number | null) {
  return count ?? 0;
}

async function buildCeoMetrics(
  supabase: SupabaseClient,
  schoolsCount: number
): Promise<CeoMetric[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [
    emailsSent,
    replies,
    interviewsBooked,
    interviewsCompleted,
    pilotInterest,
    lois,
    paidPilots
  ] = await Promise.all([
    supabase
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .eq("channel", "Email"),
    supabase
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .ilike("outcome", "%reply%"),
    supabase.from("interviews").select("id", { count: "exact", head: true }),
    supabase
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .lte("interview_date", today),
    supabase
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("sentiment", "Strong fit"),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .ilike("title", "%loi%"),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .ilike("title", "%paid pilot%")
      .eq("status", "Done")
  ]);

  return [
    {
      label: "Schools added",
      value: schoolsCount,
      detail: "Total target accounts"
    },
    {
      label: "Emails sent",
      value: countOrZero(emailsSent.count),
      detail: "Outbound school emails"
    },
    {
      label: "Replies",
      value: countOrZero(replies.count),
      detail: "Outreach outcomes containing reply"
    },
    {
      label: "Interviews booked",
      value: countOrZero(interviewsBooked.count),
      detail: "Interview records created"
    },
    {
      label: "Interviews completed",
      value: countOrZero(interviewsCompleted.count),
      detail: "Interview date on or before today"
    },
    {
      label: "Pilot interest",
      value: countOrZero(pilotInterest.count),
      detail: "Strong-fit interview sentiment"
    },
    {
      label: "LOIs",
      value: countOrZero(lois.count),
      detail: "Follow-ups with LOI in title"
    },
    {
      label: "Paid pilots",
      value: countOrZero(paidPilots.count),
      detail: "Done follow-ups titled paid pilot"
    }
  ];
}

function getSampleSchoolProfileData(schoolId: string): SchoolProfileData | null {
  const school = sampleSchools.find((sampleSchool) => sampleSchool.id === schoolId);

  if (!school) {
    return null;
  }

  const contacts = sampleSchoolContacts.filter(
    (contact) => contact.school === school.name
  );
  const outreach = sampleOutreach.filter((activity) => activity.school_id === schoolId);
  const interviews = sampleInterviews.filter(
    (interview) => interview.school_id === schoolId
  );
  const nextFollowUp =
    sampleFollowUps
      .filter((followUp) => followUp.school_id === schoolId)
      .filter((followUp) => followUp.status !== "Done")
      .sort((left, right) =>
        (left.due_date ?? "").localeCompare(right.due_date ?? "")
      )[0] ?? null;

  return {
    school,
    contacts,
    outreach,
    interviews,
    nextFollowUp,
    source: "sample"
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await getSupabaseClient();

  if (!supabase) {
    return {
      schools: sampleSchools,
      contacts: sampleContacts,
      pipeline: buildPipeline(sampleSchools),
      ceoMetrics: sampleCeoMetrics,
      source: "sample"
    };
  }

  const [schoolsResponse, contactsResponse] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name,district,location,status,owner,next_step,website")
      .order("name"),
    supabase
      .from("contacts")
      .select("id,name,role,email,last_touch,relationship,schools(name)")
      .order("last_touch", { ascending: false })
  ]);

  const schools = (schoolsResponse.data ?? sampleSchools) as School[];
  const contacts = contactsResponse.data
    ? ((contactsResponse.data as ContactRow[]).map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        school: getRelatedSchoolName(contact.schools),
        email: contact.email,
        last_touch: contact.last_touch,
        relationship: contact.relationship
      })) satisfies Contact[])
    : sampleContacts;

  return {
    schools,
    contacts,
    pipeline: buildPipeline(schools),
    ceoMetrics: await buildCeoMetrics(supabase, schools.length),
    source:
      schoolsResponse.error || contactsResponse.error ? "sample" : "supabase"
  };
}

export async function getSchoolProfileData(
  schoolId: string
): Promise<SchoolProfileData | null> {
  const supabase = await getSupabaseClient();

  if (!supabase) {
    return getSampleSchoolProfileData(schoolId);
  }

  const schoolResponse = await supabase
    .from("schools")
    .select("id,name,district,location,status,owner,next_step,notes,website,enrollment,public_private,hbcu,community_college,state,ai_programs,cyber_programs,healthcare_programs,innovation_center,entrepreneurship_center,career_services_office,workforce_development_office,profile_sources")
    .eq("id", schoolId)
    .maybeSingle();

  if (!schoolResponse.data) {
    return getSampleSchoolProfileData(schoolId);
  }

  const [contactsResponse, outreachResponse, interviewsResponse, followUpsResponse] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id,name,role,email,phone,relationship,last_touch,notes")
        .eq("school_id", schoolId)
        .order("last_touch", { ascending: false }),
      supabase
        .from("outreach")
        .select("id,channel,subject,message,outcome,outreach_date,owner,next_step")
        .eq("school_id", schoolId)
        .order("outreach_date", { ascending: false }),
      supabase
        .from("interviews")
        .select(
          "id,interviewer,interview_date,sentiment,notes,follow_up,raw_notes,pain_points,current_tools,buyer,budget,budget_owner,objections,pilot_interest,referrals,next_step"
        )
        .eq("school_id", schoolId)
        .order("interview_date", { ascending: false }),
      supabase
        .from("follow_ups")
        .select("id,title,due_date,status,owner,notes")
        .eq("school_id", schoolId)
        .neq("status", "Done")
        .order("due_date", { ascending: true })
        .limit(1)
    ]);

  const school = schoolResponse.data as School;
  const contacts = ((contactsResponse.data ?? []) as Omit<
    SchoolContact,
    "school"
  >[]).map((contact) => ({
    ...contact,
    school: school.name
  }));

  return {
    school,
    contacts,
    outreach: (outreachResponse.data ?? []) as OutreachActivity[],
    interviews: (interviewsResponse.data ?? []) as InterviewSummary[],
    nextFollowUp: ((followUpsResponse.data ?? []) as FollowUp[])[0] ?? null,
    source:
      schoolResponse.error ||
      contactsResponse.error ||
      outreachResponse.error ||
      interviewsResponse.error ||
      followUpsResponse.error
        ? "sample"
        : "supabase"
  };
}

export async function createInterviewNote(formData: FormData) {
  "use server";

  const supabase = await getSupabaseClient();

  if (!supabase) {
    return;
  }

  await supabase.from("interviews").insert({
    school_id: formData.get("school_id"),
    interviewer: formData.get("interviewer"),
    interview_date: formData.get("interview_date"),
    sentiment: formData.get("sentiment"),
    notes: formData.get("notes") || formData.get("pain_points"),
    follow_up: formData.get("next_step"),
    raw_notes: formData.get("raw_notes"),
    pain_points: formData.get("pain_points"),
    current_tools: formData.get("current_tools"),
    buyer: formData.get("buyer"),
    budget: formData.get("budget"),
    budget_owner: formData.get("budget_owner"),
    objections: formData.get("objections"),
    pilot_interest: formData.get("pilot_interest"),
    referrals: formData.get("referrals"),
    next_step: formData.get("next_step")
  });
}
