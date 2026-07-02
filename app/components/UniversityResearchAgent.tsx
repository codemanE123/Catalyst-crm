"use client";

import { useActionState } from "react";
import type {
  UniversityResearchProfile,
  UniversityResearchResult
} from "@/lib/universityResearch";

const emptyProfile: UniversityResearchProfile = {
  name: "",
  website: "",
  enrollment: "",
  public_private: "Unknown",
  hbcu: false,
  community_college: false,
  state: "",
  ai_programs: "",
  cyber_programs: "",
  healthcare_programs: "",
  innovation_center: "",
  entrepreneurship_center: "",
  career_services_office: "",
  workforce_development_office: "",
  profile_sources: []
};

const initialState: UniversityResearchResult = {
  profile: emptyProfile,
  saved: false,
  message: ""
};

function yesNo(value: boolean | null) {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Yes" : "No";
}

function ProfileField({
  label,
  value
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value || "Not found"}</p>
    </div>
  );
}

export default function UniversityResearchAgent({
  action
}: {
  action: (
    previousState: UniversityResearchResult | null,
    formData: FormData
  ) => Promise<UniversityResearchResult>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { profile } = state;
  const hasProfile = Boolean(profile.name && profile.website);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            AI university research agent
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">
            Create a school profile from public websites
          </h2>
        </div>
        <p className="text-sm text-slate-500">
          Finds public pages and populates CRM fields
        </p>
      </div>
      <form action={formAction} className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">School name</span>
          <input
            name="school_name"
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Arizona State University"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Website (optional)
          </span>
          <input
            name="website"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="https://www.asu.edu"
          />
        </label>
        <button
          disabled={isPending}
          className="self-end rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {isPending ? "Researching..." : "Run agent"}
        </button>
      </form>

      {state.message && (
        <p className="mt-4 rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-900">
          {state.message}
        </p>
      )}

      {hasProfile && (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-slate-950">
                {profile.name}
              </h3>
              <a
                href={profile.website ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-cyan-700 hover:text-cyan-900"
              >
                {profile.website || "Website not found"}
              </a>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              {state.saved ? "Saved to CRM" : "Preview only"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ProfileField label="Enrollment" value={profile.enrollment} />
            <ProfileField label="Public/Private" value={profile.public_private} />
            <ProfileField label="HBCU?" value={yesNo(profile.hbcu)} />
            <ProfileField
              label="Community College?"
              value={yesNo(profile.community_college)}
            />
            <ProfileField label="State" value={profile.state} />
            <ProfileField label="AI Programs" value={profile.ai_programs} />
            <ProfileField label="Cyber Programs" value={profile.cyber_programs} />
            <ProfileField
              label="Healthcare Programs"
              value={profile.healthcare_programs}
            />
            <ProfileField
              label="Innovation Center"
              value={profile.innovation_center}
            />
            <ProfileField
              label="Entrepreneurship Center"
              value={profile.entrepreneurship_center}
            />
            <ProfileField
              label="Career Services Office"
              value={profile.career_services_office}
            />
            <ProfileField
              label="Workforce Development Office"
              value={profile.workforce_development_office}
            />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sources
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {(profile.profile_sources ?? []).map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
