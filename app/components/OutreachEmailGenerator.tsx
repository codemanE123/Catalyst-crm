"use client";

import { FormEvent, useState } from "react";

function buildEmail(schoolName: string, contactRole: string, painPoint: string) {
  const school = schoolName.trim() || "[School name]";
  const role = contactRole.trim() || "[contact role]";
  const pain = painPoint.trim() || "[pain point]";

  return `Subject: Quick question about ${school}

Hi there,

I saw that ${school} may be working through ${pain}. I help school teams explore lightweight ways to support students without adding extra administrative load for ${role}s.

Would you be open to a 20-minute discovery conversation next week? I would love to learn how your team is approaching this and see whether a small pilot could be useful.

Best,
Catalyst`;
}

export default function OutreachEmailGenerator({
  defaults
}: {
  defaults?: {
    schoolName?: string;
    contactRole?: string;
    painPoint?: string;
  };
}) {
  const [schoolName, setSchoolName] = useState(defaults?.schoolName ?? "");
  const [contactRole, setContactRole] = useState(defaults?.contactRole ?? "");
  const [painPoint, setPainPoint] = useState(defaults?.painPoint ?? "");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  function generateEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneratedEmail(buildEmail(schoolName, contactRole, painPoint));
    setCopyStatus("idle");
  }

  async function copyEmail() {
    if (!generatedEmail) {
      return;
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(generatedEmail);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = generatedEmail;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }

    window.setTimeout(() => setCopyStatus("idle"), 2500);
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Outreach email generator
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Draft a discovery ask
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Enter a school, role, and pain point to create a short exploratory email
        asking for a 20-minute discovery conversation.
      </p>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <p className="font-medium">Privacy reminder</p>
        <p className="mt-1">
          Drafts are built locally from your inputs. Do not include student names,
          grades, IDs, protected education records, or other sensitive personal
          data in outreach emails. Review every draft before sending.
        </p>
      </div>

      <form onSubmit={generateEmail} className="mt-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">School name</span>
            <input
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Roosevelt High School"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Contact role</span>
            <input
              value={contactRole}
              onChange={(event) => setContactRole(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="college counselor"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Pain point</span>
            <input
              value={painPoint}
              onChange={(event) => setPainPoint(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="summer melt"
            />
          </label>
        </div>
        <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
          Generate email
        </button>
      </form>

      <label className="mt-6 block">
        <span className="text-sm font-medium text-slate-700">
          Generated email
        </span>
        <textarea
          value={
            generatedEmail ||
            "Fill out the fields and click Generate email to create a draft."
          }
          readOnly
          rows={9}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none"
        />
      </label>
      <button
        type="button"
        onClick={copyEmail}
        disabled={!generatedEmail}
        className="mt-4 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        {copyStatus === "copied" ? "Copied email" : "Copy email"}
      </button>
      <p className="mt-3 text-sm text-slate-500" aria-live="polite">
        {copyStatus === "copied" && "Copied to clipboard."}
        {copyStatus === "failed" && "Copy failed. Select the email text manually."}
      </p>
    </section>
  );
}
