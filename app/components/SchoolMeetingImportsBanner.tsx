import MeetingImportReviewList from "@/app/components/MeetingImportReviewList";
import type { MeetingImportRecord } from "@/lib/meetingImports/types";

type SchoolOption = { id: string; name: string };

export default function SchoolMeetingImportsBanner({
  imports,
  schools,
  canAct
}: {
  imports: MeetingImportRecord[];
  schools: SchoolOption[];
  canAct: boolean;
}) {
  if (imports.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-sky-50">
          Pending Fireflies imports ({imports.length})
        </h2>
        <p className="mt-1 text-xs text-sky-100/80">
          Accept to create discovery interview notes, or reject to discard.
        </p>
      </div>
      <MeetingImportReviewList
        canAct={canAct}
        compact
        imports={imports}
        schools={schools}
      />
    </section>
  );
}
