import {
  FollowUp,
  getSchoolProfileData,
  InterviewSummary,
  OutreachActivity,
  School,
  SchoolContact
} from "@/lib/supabase";
import {
  getSchoolOrganizationId,
  MUTATION_ROLES,
  requireRole,
  RESTRICTED_FIELD_PLACEHOLDER
} from "@/lib/authz";
import { createOutreachLog } from "@/lib/actions/outreach";
import {
  completeFollowUp,
  createFollowUp,
  getOpenFollowUpsForSchool
} from "@/lib/actions/followUps";
import { createContact, updateContact } from "@/lib/actions/contacts";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import { notFound } from "next/navigation";
import Link from "next/link";
import OutreachLogForm from "@/app/components/OutreachLogForm";
import FollowUpPanel from "@/app/components/FollowUpPanel";
import ContactForm from "@/app/components/ContactForm";
import SchoolRecommendedContactRolesSection from "@/app/components/SchoolRecommendedContactRolesSection";
import { runContactDiscoveryForSchool } from "@/lib/actions/contactDiscovery";
import { fetchContactRecommendationsForTarget } from "@/lib/contactDiscovery/execute";

export const dynamic = "force-dynamic";

const statusStyles: Record<School["status"], string> = {
  Prospect: "bg-slate-100 text-slate-700 ring-slate-200",
  Contacted: "bg-sky-100 text-sky-700 ring-sky-200",
  Interviewing: "bg-amber-100 text-amber-800 ring-amber-200",
  Partner: "bg-emerald-100 text-emerald-700 ring-emerald-200"
};

export default async function SchoolProfile({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getSchoolProfileData(id);

  if (!profile) {
    notFound();
  }

  const { school, contacts, outreach, interviews, nextFollowUp, source, restrictedFieldsRedacted } =
    profile;

  const canMutateSchool = await userCanMutateSchool(id);
  const openFollowUps = await getOpenFollowUpsForSchool(id);
  const supabase = await getServerSupabaseClient();
  const schoolOrganizationId = supabase
    ? await getSchoolOrganizationId(supabase, id)
    : null;
  const contactRecommendations =
    supabase && schoolOrganizationId && source === "supabase"
      ? await fetchContactRecommendationsForTarget(
          supabase,
          schoolOrganizationId,
          "school",
          id
        )
      : [];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <Link
          href="/"
          prefetch={false}
          className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          Back to dashboard
        </Link>

        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl shadow-slate-200">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
                School profile
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                {school.name}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                {school.district} · {school.location}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProfileBadge label="Status" value={school.status} />
              <ProfileBadge
                label="Data source"
                value={source === "supabase" ? "Supabase" : "Sample"}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Owner" value={school.owner} />
          <SummaryCard label="Contacts" value={contacts.length.toString()} />
          <SummaryCard label="Interviews" value={interviews.length.toString()} />
        </section>

        {restrictedFieldsRedacted ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Some sensitive fields are hidden for your role. Budget, objections,
            raw interview notes, and follow-up notes appear as &quot;
            {RESTRICTED_FIELD_PLACEHOLDER}&quot;.
          </section>
        ) : null}

        <section className="grid gap-8 xl:grid-cols-[1fr_0.75fr]">
          <div className="flex flex-col gap-8">
            <UniversityProfilePanel school={school} />
            <SchoolRecommendedContactRolesSection
              actionsEnabled={source === "supabase"}
              canDiscover={canMutateSchool}
              discoverAction={runContactDiscoveryForSchool}
              recommendations={contactRecommendations}
              schoolId={school.id}
              schoolName={school.name}
            />
            <SchoolNotes school={school} />
            {canMutateSchool ? (
              <ContactForm
                schoolId={school.id}
                schoolName={school.name}
                contacts={contacts}
                createAction={createContact}
                updateAction={updateContact}
              />
            ) : null}
            <ContactsPanel contacts={contacts} />
            {canMutateSchool ? (
              <OutreachLogForm
                schoolId={school.id}
                schoolName={school.name}
                action={createOutreachLog}
              />
            ) : null}
            <OutreachHistory outreach={outreach} />
          </div>
          <div className="flex flex-col gap-8">
            <StatusPanel school={school} nextFollowUp={nextFollowUp} />
            {canMutateSchool ? (
              <FollowUpPanel
                schoolId={school.id}
                schoolName={school.name}
                openFollowUps={openFollowUps}
                createAction={createFollowUp}
                completeAction={completeFollowUp}
              />
            ) : null}
            <InterviewSummaries interviews={interviews} />
          </div>
        </section>
      </div>
    </main>
  );
}

async function userCanMutateSchool(schoolId: string): Promise<boolean> {
  const user = await requireUser();
  const supabase = await getServerSupabaseClient();

  if (!user || !supabase) {
    return false;
  }

  const schoolOrganizationId = await getSchoolOrganizationId(supabase, schoolId);

  if (!schoolOrganizationId) {
    return false;
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    schoolOrganizationId
  );

  return membership !== null;
}

function ProfileBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function UniversityProfilePanel({ school }: { school: School }) {
  const hasResearchProfile = Boolean(
    school.website ||
      school.enrollment ||
      school.ai_programs ||
      school.cyber_programs ||
      school.healthcare_programs
  );

  if (!hasResearchProfile) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        University research profile
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Public website intelligence
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ResearchField label="Website" value={school.website} />
        <ResearchField label="Enrollment" value={school.enrollment} />
        <ResearchField label="Public/Private" value={school.public_private} />
        <ResearchField label="HBCU?" value={yesNo(school.hbcu)} />
        <ResearchField
          label="Community College?"
          value={yesNo(school.community_college)}
        />
        <ResearchField label="State" value={school.state} />
        <ResearchField label="AI Programs" value={school.ai_programs} />
        <ResearchField label="Cyber Programs" value={school.cyber_programs} />
        <ResearchField
          label="Healthcare Programs"
          value={school.healthcare_programs}
        />
        <ResearchField
          label="Innovation Center"
          value={school.innovation_center}
        />
        <ResearchField
          label="Entrepreneurship Center"
          value={school.entrepreneurship_center}
        />
        <ResearchField
          label="Career Services Office"
          value={school.career_services_office}
        />
        <ResearchField
          label="Workforce Development Office"
          value={school.workforce_development_office}
        />
      </div>
      {school.profile_sources?.length ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sources
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {school.profile_sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ResearchField({
  label,
  value
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {value || "Not found"}
      </p>
    </div>
  );
}

function yesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  return value ? "Yes" : "No";
}

function SchoolNotes({ school }: { school: School }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Notes
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Account context
      </h2>
      <p className="mt-4 leading-7 text-slate-600">
        {school.notes ?? "No account notes yet."}
      </p>
    </section>
  );
}

function StatusPanel({
  school,
  nextFollowUp
}: {
  school: School;
  nextFollowUp: FollowUp | null;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Status
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[school.status]}`}
        >
          {school.status}
        </span>
        <span className="text-sm text-slate-500">Owner: {school.owner}</span>
      </div>
      <div className="mt-6 rounded-2xl bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-500">Next follow-up</p>
        {nextFollowUp ? (
          <div className="mt-2">
            <p className="font-semibold text-slate-950">{nextFollowUp.title}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatDate(nextFollowUp.due_date)} · {nextFollowUp.status}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              <RedactedText value={nextFollowUp.notes ?? "No follow-up notes."} />
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            No open follow-up is scheduled.
          </p>
        )}
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-500">Dashboard next step</p>
        <p className="mt-2 text-sm text-slate-600">{school.next_step}</p>
      </div>
    </section>
  );
}

function ContactsPanel({ contacts }: { contacts: SchoolContact[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Contacts
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        People at this school
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {contacts.length ? (
          contacts.map((contact) => (
            <article key={contact.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{contact.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{contact.role}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {contact.relationship}
                </span>
              </div>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p>{contact.email}</p>
                <p>{contact.phone ?? "No phone listed"}</p>
                <p>Last touch: {formatDate(contact.last_touch)}</p>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {contact.notes ?? "No contact notes."}
              </p>
            </article>
          ))
        ) : (
          <EmptyState message="No contacts added for this school yet." />
        )}
      </div>
    </section>
  );
}

function OutreachHistory({ outreach }: { outreach: OutreachActivity[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Outreach history
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Touchpoints and outcomes
      </h2>
      <div className="mt-6 space-y-4">
        {outreach.length ? (
          outreach.map((activity) => (
            <article key={activity.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-slate-950">
                  {activity.subject ?? activity.channel}
                </p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {activity.channel} · {formatDate(activity.outreach_date)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {activity.message ?? "No outreach note."}
              </p>
              <p className="mt-3 text-sm font-medium text-slate-700">
                Outcome: {activity.outcome ?? "No outcome logged"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Next: {activity.next_step ?? "No next step logged"}
              </p>
            </article>
          ))
        ) : (
          <EmptyState message="No outreach has been logged for this school yet." />
        )}
      </div>
    </section>
  );
}

function InterviewSummaries({
  interviews
}: {
  interviews: InterviewSummary[];
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Interview summaries
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Discovery notes
      </h2>
      <div className="mt-6 space-y-4">
        {interviews.length ? (
          interviews.map((interview) => (
            <article key={interview.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-slate-950">
                  {formatDate(interview.interview_date)}
                </p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {interview.sentiment}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Interviewer: {interview.interviewer}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {interview.notes}
              </p>
              <dl className="mt-4 grid gap-3 text-sm">
                <DiscoveryDetail label="Raw notes" value={interview.raw_notes} />
                <DiscoveryDetail label="Pain points" value={interview.pain_points} />
                <DiscoveryDetail
                  label="Current tools"
                  value={interview.current_tools}
                />
                <DiscoveryDetail label="Buyer" value={interview.buyer} />
                <DiscoveryDetail label="Budget" value={interview.budget} />
                <DiscoveryDetail
                  label="Budget owner"
                  value={interview.budget_owner}
                />
                <DiscoveryDetail label="Objections" value={interview.objections} />
                <DiscoveryDetail
                  label="Pilot interest"
                  value={interview.pilot_interest}
                />
                <DiscoveryDetail label="Referrals" value={interview.referrals} />
              </dl>
              <p className="mt-3 text-sm font-medium text-slate-700">
                Next step:{" "}
                {interview.next_step ??
                  interview.follow_up ??
                  "No next step logged"}
              </p>
            </article>
          ))
        ) : (
          <EmptyState message="No interview summaries have been captured yet." />
        )}
      </div>
    </section>
  );
}

function DiscoveryDetail({
  label,
  value
}: {
  label: string;
  value: string | null;
}) {
  if (!value) {
    return null;
  }

  const isRedacted = value === RESTRICTED_FIELD_PLACEHOLDER;

  return (
    <div
      className={`rounded-xl p-3 ring-1 ${
        isRedacted
          ? "bg-amber-50 ring-amber-200"
          : "bg-white ring-slate-200"
      }`}
    >
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 ${
          isRedacted
            ? "font-medium italic text-amber-800"
            : "text-slate-700"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function RedactedText({ value }: { value: string }) {
  if (value !== RESTRICTED_FIELD_PLACEHOLDER) {
    return <>{value}</>;
  }

  return (
    <span className="font-medium italic text-amber-800">
      {RESTRICTED_FIELD_PLACEHOLDER}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
      {message}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}
