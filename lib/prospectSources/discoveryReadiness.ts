import { isCollegeScorecardConfigured } from "@/lib/prospectSources/collegeScorecard";
import { resolveCollegeScorecardConfig } from "@/lib/prospectSources/config";
import {
  getPublicWebConfigurationStatus,
  isPublicWebDiscoveryReady,
  resolvePublicWebDiscoveryConfig
} from "@/lib/prospectSources/publicWebConfig";
import { isDevelopmentEnvironment } from "@/lib/supabaseServer";

export type ProspectDiscoveryProviderStatus = {
  scorecardReady: boolean;
  publicWebReady: boolean;
  anyReady: boolean;
  scorecardStatus: string;
  publicWebStatus: string;
};

/**
 * Client-safe readiness snapshot for Scorecard + public-web discovery.
 * Not a server action — keep out of `"use server"` modules.
 */
export function getProspectDiscoveryProviderStatus(
  env: NodeJS.ProcessEnv = process.env
): ProspectDiscoveryProviderStatus {
  const scorecard = resolveCollegeScorecardConfig(env);
  const publicWeb = resolvePublicWebDiscoveryConfig(env);
  const scorecardReady =
    scorecard.enabled && isCollegeScorecardConfigured(env);
  const publicWebReady = isPublicWebDiscoveryReady(publicWeb);
  const localDevStub =
    isDevelopmentEnvironment() &&
    env.VERCEL_ENV !== "production" &&
    env.VERCEL_ENV !== "preview";

  return {
    scorecardReady,
    publicWebReady,
    anyReady: scorecardReady || publicWebReady || localDevStub,
    scorecardStatus: !scorecard.enabled
      ? "disabled"
      : scorecardReady
        ? "ready"
        : "missing_api_key",
    publicWebStatus: getPublicWebConfigurationStatus(publicWeb)
  };
}
