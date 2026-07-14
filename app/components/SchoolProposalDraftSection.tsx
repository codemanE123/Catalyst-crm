import ProposalDraftPanel from "@/app/components/ProposalDraftPanel";
import type { ProposalGenerationActionResult } from "@/lib/actions/proposalGeneration";
import type { ProposalDraft } from "@/lib/proposalGeneration/types";

export default function SchoolProposalDraftSection({
  schoolId,
  schoolName,
  draft,
  canGenerate,
  actionsEnabled,
  generateAction
}: {
  schoolId: string;
  schoolName: string;
  draft: ProposalDraft | null;
  canGenerate: boolean;
  actionsEnabled: boolean;
  generateAction: (schoolId: string) => Promise<ProposalGenerationActionResult>;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Proposal generation
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">Proposal draft</h2>
      <p className="mt-2 text-sm text-slate-600">
        Internal partnership outline for {schoolName}. Review and edit before external sharing.
      </p>
      <div className="mt-6">
        <ProposalDraftPanel
          actionsEnabled={actionsEnabled}
          canGenerate={canGenerate}
          draft={draft}
          generateAction={() => generateAction(schoolId)}
          targetLabel={schoolName}
        />
      </div>
    </section>
  );
}
