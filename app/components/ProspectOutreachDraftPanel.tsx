"use client";

import type { ProspectOutreachDraftResult } from "@/lib/actions/prospectCandidates";
import { PROSPECT_OUTREACH_DRAFT_REVIEW_WARNING } from "@/lib/llm/outreachDraft";
import { useState, useTransition } from "react";

export default function ProspectOutreachDraftPanel({
  candidateId,
  candidateName,
  canGenerate,
  actionsEnabled,
  outreachDraftEnabled,
  outreachDraftDisabledReason,
  generateDraftAction
}: {
  candidateId: string;
  candidateName: string;
  canGenerate: boolean;
  actionsEnabled: boolean;
  outreachDraftEnabled: boolean;
  outreachDraftDisabledReason: string;
  generateDraftAction: (candidateId: string) => Promise<ProspectOutreachDraftResult>;
}) {
  const [draftText, setDraftText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function copyDraft() {
    if (!draftText.trim()) {
      return;
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(draftText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = draftText;
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

  function handleGenerateDraft() {
    setError(null);
    setNotice(null);

    if (!outreachDraftEnabled) {
      setNotice(outreachDraftDisabledReason);
      return;
    }

    setIsGenerating(true);

    startTransition(async () => {
      try {
        const result = await generateDraftAction(candidateId);

        if (!result.ok) {
          if (result.disabled) {
            setNotice(result.error);
            return;
          }

          setError(result.error);
          return;
        }

        setDraftText(result.draft);
      } finally {
        setIsGenerating(false);
      }
    });
  }

  if (!canGenerate) {
    return <span className="text-slate-400">—</span>;
  }

  const busy = isPending || isGenerating;

  return (
    <div className="max-w-md space-y-3">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
        {PROSPECT_OUTREACH_DRAFT_REVIEW_WARNING}
      </p>

      {!outreachDraftEnabled ? (
        <p className="text-xs text-slate-500">{outreachDraftDisabledReason}</p>
      ) : null}

      <button
        className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900 disabled:opacity-60"
        disabled={!actionsEnabled || busy}
        onClick={handleGenerateDraft}
        type="button"
      >
        {isGenerating ? "Generating draft…" : "Generate outreach draft"}
      </button>

      <label className="block">
        <span className="text-xs font-medium text-slate-700">
          Outreach draft for {candidateName}
        </span>
        <textarea
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-800 outline-none ring-cyan-500 focus:ring-2"
          onChange={(event) => setDraftText(event.target.value)}
          placeholder="Generate a draft, then edit it here before copying or sending externally."
          rows={10}
          value={draftText}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          disabled={!draftText.trim()}
          onClick={copyDraft}
          type="button"
        >
          {copyStatus === "copied" ? "Copied" : "Copy to clipboard"}
        </button>
        {copyStatus === "failed" ? (
          <span className="text-xs text-red-700">Copy failed. Select the text manually.</span>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-slate-600" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
