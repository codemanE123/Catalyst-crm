import { createClient } from "@supabase/supabase-js";

export type School = {
  id: string;
  name: string;
  district: string;
  location: string;
  status: "Prospect" | "Contacted" | "Interviewing" | "Partner";
  owner: string;
  next_step: string;
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
    next_step: "Principal interview on Friday"
  },
  {
    id: "school-2",
    name: "North Star Academy",
    district: "Metro Charter Network",
    location: "Denver, CO",
    status: "Contacted",
    owner: "Jon Bell",
    next_step: "Send program overview"
  },
  {
    id: "school-3",
    name: "Lakeview Middle School",
    district: "Lakeview Schools",
    location: "Madison, WI",
    status: "Prospect",
    owner: "Priya Shah",
    next_step: "Find counseling lead"
  },
  {
    id: "school-4",
    name: "Cedar Ridge Prep",
    district: "Independent",
    location: "Austin, TX",
    status: "Partner",
    owner: "Maya Chen",
    next_step: "Quarterly success review"
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

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
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
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
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

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseClient();

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
      .select("id,name,district,location,status,owner,next_step")
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

export async function createInterviewNote(formData: FormData) {
  "use server";

  const supabase = getSupabaseClient();

  if (!supabase) {
    return;
  }

  await supabase.from("interviews").insert({
    school_id: formData.get("school_id"),
    interviewer: formData.get("interviewer"),
    interview_date: formData.get("interview_date"),
    sentiment: formData.get("sentiment"),
    notes: formData.get("notes"),
    follow_up: formData.get("follow_up")
  });
}
