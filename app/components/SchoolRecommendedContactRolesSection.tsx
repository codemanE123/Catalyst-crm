import RecommendedContactRolesPanel from "@/app/components/RecommendedContactRolesPanel";
import type { ContactDiscoveryActionResult } from "@/lib/actions/contactDiscovery";
import type { ProspectContactRecommendation } from "@/lib/contactDiscovery/types";

export default function SchoolRecommendedContactRolesSection({
  schoolId,
  schoolName,
  recommendations,
  canDiscover,
  actionsEnabled,
  discoverAction
}: {
  schoolId: string;
  schoolName: string;
  recommendations: ProspectContactRecommendation[];
  canDiscover: boolean;
  actionsEnabled: boolean;
  discoverAction: (schoolId: string) => Promise<ContactDiscoveryActionResult>;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Contact discovery
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Recommended contact roles
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Role suggestions for {schoolName}. Verify titles on the institution&apos;s public website
        before outreach. Recommendations do not create CRM contacts automatically.
      </p>
      <div className="mt-6">
        <RecommendedContactRolesPanel
          actionsEnabled={actionsEnabled}
          canDiscover={canDiscover}
          discoverAction={() => discoverAction(schoolId)}
          recommendations={recommendations}
          targetLabel={schoolName}
        />
      </div>
    </section>
  );
}
