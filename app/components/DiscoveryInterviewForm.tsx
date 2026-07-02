"use client";

import type { School } from "@/lib/supabase";
import { useState } from "react";

type Summary = {
  painPoints: string;
  currentTools: string;
  buyer: string;
  budget: string;
  budgetOwner: string;
  objections: string;
  pilotInterest: "High" | "Medium" | "Low" | "None";
  referrals: string;
  nextStep: string;
  notes: string;
};

const emptySummary: Summary = {
  painPoints: "",
  currentTools: "",
  buyer: "",
  budget: "",
  budgetOwner: "",
  objections: "",
  pilotInterest: "Medium",
  referrals: "",
  nextStep: "",
  notes: ""
};

function splitSentences(notes: string) {
  return notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function findSentence(sentences: string[], terms: string[]) {
  return (
    sentences.find((sentence) =>
      terms.some((term) => sentence.toLowerCase().includes(term))
    ) ?? ""
  );
}

function cleanFragment(value: string) {
  return value
    .replace(/^(the|a|an|they|we|us)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
}

function extractMatch(notes: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = notes.match(pattern);

    if (match?.[1]) {
      return cleanFragment(match[1]);
    }
  }

  return "";
}

function inferPilotInterest(notes: string): Summary["pilotInterest"] {
  const lowerNotes = notes.toLowerCase();

  if (/(not interested|no pilot|not a fit|pass)/.test(lowerNotes)) {
    return "None";
  }

  if (/(ready|strong fit|high interest|this fall|pilot soon|urgent)/.test(lowerNotes)) {
    return "High";
  }

  if (/(concern|hesitant|blocked|unclear|low interest)/.test(lowerNotes)) {
    return "Low";
  }

  return "Medium";
}

function summarizeNotes(rawNotes: string): Summary {
  const sentences = splitSentences(rawNotes);
  const painSentence =
    findSentence(sentences, [
      "pain",
      "challenge",
      "struggle",
      "problem",
      "need",
      "manual",
      "capacity",
      "risk"
    ]) || sentences[0] || "";
  const painPoints = cleanFragment(painSentence.split(/\band\b.*\busing\b/i)[0]);
  const buyer =
    extractMatch(rawNotes, [
      /(?:^|[.!?]\s+)(?:the\s+)?([^.!?]+?)\s+is\s+the\s+buyer/i,
      /buyer\s+(?:is|:)\s+([^.]+)/i,
      /decision[-\s]?maker\s+(?:is|:)\s+([^.]+)/i
    ]) ||
    findSentence(sentences, [
      "buyer",
      "principal",
      "director",
      "superintendent",
      "decision",
      "approver"
    ]);
  const budget =
    extractMatch(rawNotes, [
      /budget\s+(?:from|comes from|is from)\s+([^.]+)/i,
      /owns\s+the\s+budget\s+from\s+([^.]+)/i,
      /fund(?:ed|ing)?\s+(?:from|by)\s+([^.]+)/i,
      /budget\s+(?:is|:)\s+([^.]+)/i
    ]) ||
    findSentence(sentences, ["budget", "funding", "grant", "cost", "procurement"]);
  const currentTools =
    extractMatch(rawNotes, [
      /(?:using|uses|use|stuck using)\s+([^.]+)/i,
      /current tools\s*(?:are|:)\s*([^.]+)/i
    ]) ||
    findSentence(sentences, ["spreadsheet", "email", "tool", "crm", "sis", "manual"]);
  const nextStep =
    extractMatch(rawNotes, [
      /(?:asked us to|next step is to|next action is to)\s+([^.]+)/i,
      /(?:send|schedule|book|follow up)\s+([^.]+)/i
    ]) || findSentence(sentences, ["next", "follow up", "send", "schedule", "book"]);
  const referrals =
    extractMatch(rawNotes, [
      /referred us to\s+([^.]+)/i,
      /referral(?:s)?\s*(?:are|:)\s*([^.]+)/i,
      /(?:speak with|talk to|connect with)\s+([^.]+)/i
    ]) ||
    findSentence(sentences, ["referral", "introduced", "speak with", "talk to", "connect"]);
  const objections = findSentence(sentences, [
    "objection",
    "concern",
    "worried",
    "hesitant",
    "blocked",
    "staff lift",
    "procurement"
  ]);

  return {
    painPoints,
    currentTools,
    buyer,
    budget,
    budgetOwner: buyer,
    objections,
    pilotInterest: inferPilotInterest(rawNotes),
    referrals,
    nextStep,
    notes: sentences.slice(0, 2).join(" ")
  };
}

export default function DiscoveryInterviewForm({
  schools,
  action
}: {
  schools: School[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [rawNotes, setRawNotes] = useState("");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [summaryStatus, setSummaryStatus] = useState("");

  function generateSummary() {
    const nextSummary = summarizeNotes(rawNotes);
    setSummary(nextSummary);
    setSummaryStatus("AI summary generated.");
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Discovery interview
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Capture discovery details
      </h2>
      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">School</span>
          <select
            name="school_id"
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            defaultValue=""
          >
            <option value="" disabled>
              Select school
            </option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Interviewer</span>
            <input
              name="interviewer"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Team member"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              name="interview_date"
              type="date"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Raw interview notes</span>
          <textarea
            name="raw_notes"
            value={rawNotes}
            onChange={(event) => setRawNotes(event.target.value)}
            required
            rows={6}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Paste rough notes from the discovery call."
          />
        </label>
        <button
          type="button"
          onClick={generateSummary}
          disabled={!rawNotes.trim()}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Generate AI summary
        </button>
        <p className="text-sm text-slate-500" aria-live="polite">
          {summaryStatus}
        </p>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Pain points</span>
          <textarea
            name="pain_points"
            value={summary.painPoints}
            onChange={(event) =>
              setSummary({ ...summary, painPoints: event.target.value })
            }
            required
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="What problems are they trying to solve?"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Current tools</span>
          <textarea
            name="current_tools"
            value={summary.currentTools}
            onChange={(event) =>
              setSummary({ ...summary, currentTools: event.target.value })
            }
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Spreadsheets, SIS, CRM, email campaigns, manual workflows"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Buyer</span>
            <input
              name="buyer"
              value={summary.buyer}
              onChange={(event) =>
                setSummary({ ...summary, buyer: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Principal, district lead, counseling director"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Budget</span>
            <input
              name="budget"
              value={summary.budget}
              onChange={(event) =>
                setSummary({ ...summary, budget: event.target.value })
              }
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Funding source, timing, or approval path"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Budget owner</span>
          <input
            name="budget_owner"
            value={summary.budgetOwner}
            onChange={(event) =>
              setSummary({ ...summary, budgetOwner: event.target.value })
            }
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Who controls or approves spend?"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Objections</span>
          <textarea
            name="objections"
            value={summary.objections}
            onChange={(event) =>
              setSummary({ ...summary, objections: event.target.value })
            }
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Concerns about timing, budget, staff lift, procurement, or fit"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Pilot readiness</span>
            <select
              name="pilot_interest"
              required
              value={summary.pilotInterest}
              onChange={(event) =>
                setSummary({
                  ...summary,
                  pilotInterest: event.target.value as Summary["pilotInterest"]
                })
              }
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
              <option>None</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Sentiment</span>
            <select
              name="sentiment"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              defaultValue="Warm"
            >
              <option>Strong fit</option>
              <option>Warm</option>
              <option>Needs nurturing</option>
              <option>Not a fit</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Referrals</span>
          <input
            name="referrals"
            value={summary.referrals}
            onChange={(event) =>
              setSummary({ ...summary, referrals: event.target.value })
            }
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Other contacts or schools they suggested"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Interview summary</span>
          <textarea
            name="notes"
            value={summary.notes}
            onChange={(event) =>
              setSummary({ ...summary, notes: event.target.value })
            }
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Short summary of fit, buying process, and decision criteria"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Next action</span>
          <input
            name="next_step"
            value={summary.nextStep}
            onChange={(event) =>
              setSummary({ ...summary, nextStep: event.target.value })
            }
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Next action"
          />
        </label>
        <button className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
          Save discovery interview
        </button>
      </form>
    </section>
  );
}
