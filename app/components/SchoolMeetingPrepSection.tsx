import MeetingPrepPanel from "@/app/components/MeetingPrepPanel";
import type { MeetingPrepActionResult } from "@/lib/actions/meetingPrep";
import type { MeetingPrepBrief } from "@/lib/meetingPrep/types";

export default function SchoolMeetingPrepSection({
  schoolId,
  schoolName,
  brief,
  canGenerate,
  actionsEnabled,
  generateAction
}: {
  schoolId: string;
  schoolName: string;
  brief: MeetingPrepBrief | null;
  canGenerate: boolean;
  actionsEnabled: boolean;
  generateAction: (schoolId: string) => Promise<MeetingPrepActionResult>;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Meeting preparation
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">Meeting prep</h2>
      <p className="mt-2 text-sm text-slate-600">
        Internal discovery brief for {schoolName}. Review before meetings; do not send externally.
      </p>
      <div className="mt-6">
        <MeetingPrepPanel
          actionsEnabled={actionsEnabled}
          brief={brief}
          canGenerate={canGenerate}
          generateAction={generateAction.bind(null, schoolId)}
          targetLabel={schoolName}
        />
      </div>
    </section>
  );
}
