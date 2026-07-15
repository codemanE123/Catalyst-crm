/**
 * Minimal robots.txt evaluator for a single user-agent.
 * Conservative: missing/unparseable robots + requireRobots → disallow crawl.
 */

export type RobotsDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

function matchingUserAgentGroups(
  robotsText: string,
  userAgent: string
): string[] {
  const uaToken = userAgent.split(/[/\s]/)[0]?.toLowerCase() ?? "*";
  const lines = robotsText.split(/\r?\n/);
  const groups: Array<{ agents: string[]; rules: string[] }> = [];
  let current: { agents: string[]; rules: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) {
      current = { agents: ["*"], rules: [] };
      groups.push(current);
    }

    if (key === "allow" || key === "disallow") {
      current.rules.push(`${key}:${value}`);
    }
  }

  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent === uaToken || agent === userAgent.toLowerCase())
  );
  if (specific.length > 0) {
    return specific.flatMap((group) => group.rules);
  }

  const star = groups.filter((group) =>
    group.agents.some((agent) => agent === "*")
  );
  return star.flatMap((group) => group.rules);
}

function pathMatchesRule(path: string, rulePath: string): boolean {
  if (!rulePath) {
    return false;
  }
  if (rulePath === "/") {
    return true;
  }
  return path.startsWith(rulePath);
}

/**
 * Evaluate whether `path` is allowed for `userAgent` given robots.txt body.
 */
export function evaluateRobotsTxt(params: {
  robotsText: string;
  userAgent: string;
  path: string;
}): RobotsDecision {
  const rules = matchingUserAgentGroups(params.robotsText, params.userAgent);
  const path = params.path.startsWith("/") ? params.path : `/${params.path}`;

  let bestAllow: { length: number } | null = null;
  let bestDisallow: { length: number } | null = null;

  for (const rule of rules) {
    const [kind, ...rest] = rule.split(":");
    const rulePath = rest.join(":") || "";
    if (!pathMatchesRule(path, rulePath)) {
      continue;
    }
    const length = rulePath.length;
    if (kind === "allow") {
      if (!bestAllow || length > bestAllow.length) {
        bestAllow = { length };
      }
    } else if (kind === "disallow") {
      if (rulePath === "") {
        continue;
      }
      if (!bestDisallow || length > bestDisallow.length) {
        bestDisallow = { length };
      }
    }
  }

  if (bestAllow && bestDisallow) {
    if (bestAllow.length >= bestDisallow.length) {
      return { allowed: true };
    }
    return { allowed: false, reason: "robots_disallow" };
  }

  if (bestDisallow) {
    return { allowed: false, reason: "robots_disallow" };
  }

  return { allowed: true };
}
