"use client";

import { useMemo, useState } from "react";

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

export default function OutreachEmailGenerator() {
  const [schoolName, setSchoolName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [copied, setCopied] = useState(false);

  const email = useMemo(
    () => buildEmail(schoolName, contactRole, painPoint),
    [schoolName, contactRole, painPoint]
  );

  async function copyEmail() {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">School name</span>
          <input
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Roosevelt High School"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Contact role</span>
          <input
            value={contactRole}
            onChange={(event) => setContactRole(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="college counselor"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Pain point</span>
          <input
            value={painPoint}
            onChange={(event) => setPainPoint(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="summer melt"
          />
        </label>
      </div>

      <label className="mt-6 block">
        <span className="text-sm font-medium text-slate-700">
          Generated email
        </span>
        <textarea
          value={email}
          readOnly
          rows={9}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none"
        />
      </label>
      <button
        type="button"
        onClick={copyEmail}
        className="mt-4 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
      >
        {copied ? "Copied email" : "Copy email"}
      </button>
    </section>
  );
}
