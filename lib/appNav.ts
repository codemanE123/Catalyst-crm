export type AppNavItem = {
  href: string;
  label: string;
  icon: AppNavIcon;
};

export type AppNavGroup = {
  id: string;
  label: string;
  items: AppNavItem[];
};

export type AppNavIcon =
  | "dashboard"
  | "schools"
  | "contacts"
  | "followups"
  | "meetings"
  | "prospects"
  | "jobs"
  | "approvals"
  | "agents"
  | "prompts"
  | "rollouts"
  | "policies"
  | "simulations"
  | "readiness"
  | "settings";

export type AppNavVisibility = {
  showProspects: boolean;
  showApprovals: boolean;
  showAgents: boolean;
  showSettings: boolean;
};

export function buildAppNavGroups(visibility: AppNavVisibility): AppNavGroup[] {
  const groups: AppNavGroup[] = [
    {
      id: "workspace",
      label: "Workspace",
      items: [
        { href: "/", label: "Dashboard", icon: "dashboard" },
        { href: "/schools", label: "Schools", icon: "schools" },
        { href: "/contacts", label: "Contacts", icon: "contacts" },
        { href: "/follow-ups", label: "Follow-ups", icon: "followups" },
        { href: "/meeting-imports", label: "Meeting imports", icon: "meetings" }
      ]
    }
  ];

  const prospecting: AppNavItem[] = [];

  if (visibility.showProspects) {
    prospecting.push(
      { href: "/prospects/generate", label: "Generate Prospects", icon: "prospects" },
      { href: "/prospects/jobs", label: "Prospect Jobs", icon: "jobs" }
    );
  }

  if (visibility.showApprovals) {
    prospecting.push({
      href: "/approvals",
      label: "Approvals",
      icon: "approvals"
    });
  }

  if (prospecting.length) {
    groups.push({
      id: "prospecting",
      label: "Prospecting",
      items: prospecting
    });
  }

  if (visibility.showAgents) {
    groups.push({
      id: "agents",
      label: "Agent Operations",
      items: [
        { href: "/agents", label: "Overview", icon: "agents" },
        { href: "/agents/prompts", label: "Prompts", icon: "prompts" },
        { href: "/agents/rollouts", label: "Rollouts", icon: "rollouts" },
        { href: "/agents/policies", label: "Policies", icon: "policies" },
        { href: "/agents/readiness", label: "Simulations", icon: "simulations" },
        { href: "/agents/readiness", label: "Readiness", icon: "readiness" }
      ]
    });
  }

  if (visibility.showSettings) {
    groups.push({
      id: "system",
      label: "System",
      items: [
        { href: "/settings/members", label: "Settings", icon: "settings" }
      ]
    });
  }

  return groups;
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/schools") {
    return pathname === "/schools" || pathname.startsWith("/schools/");
  }

  if (href === "/meeting-imports") {
    return (
      pathname === "/meeting-imports" ||
      pathname.startsWith("/meeting-imports/")
    );
  }

  if (href === "/prospects/generate") {
    return pathname === "/prospects/generate";
  }

  if (href === "/prospects/jobs") {
    return (
      pathname === "/prospects/jobs" || pathname.startsWith("/prospects/jobs/")
    );
  }

  if (href === "/agents") {
    return pathname === "/agents";
  }

  if (href === "/agents/readiness") {
    return pathname.startsWith("/agents/readiness");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
