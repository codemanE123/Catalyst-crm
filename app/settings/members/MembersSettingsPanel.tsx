"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  removeMember,
  updateMemberRole,
  type MembershipActionResult,
  type OrganizationMemberRow
} from "@/lib/actions/memberships";
import type { AppRole, Organization } from "@/lib/supabase";

const ROLE_OPTIONS: AppRole[] = ["read_only", "sales", "admin", "super_admin"];

type MembersSettingsPanelProps = {
  organizations: Organization[];
  initialOrganizationId: string;
  initialMembers: OrganizationMemberRow[];
  actorIsSuperAdmin: boolean;
};

function formatUserId(userId: string) {
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export default function MembersSettingsPanel({
  organizations,
  initialOrganizationId,
  initialMembers,
  actorIsSuperAdmin
}: MembersSettingsPanelProps) {
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleResult(result: MembershipActionResult) {
    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setMessage("Membership updated.");
    router.refresh();
  }

  function handleRoleChange(membershipId: string, role: AppRole) {
    const formData = new FormData();
    formData.set("organization_id", organizationId);
    formData.set("membership_id", membershipId);
    formData.set("role", role);

    startTransition(async () => {
      handleResult(await updateMemberRole(formData));
    });
  }

  function handleRemove(membershipId: string) {
    const formData = new FormData();
    formData.set("organization_id", organizationId);
    formData.set("membership_id", membershipId);

    startTransition(async () => {
      handleResult(await removeMember(formData));
    });
  }

  const selectableRoles = actorIsSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((role) => role !== "super_admin");

  return (
    <div className="flex flex-col gap-6">
      {organizations.length > 1 ? (
        <label className="flex max-w-md flex-col gap-2 text-sm">
          <span className="font-medium text-slate-700">Organization</span>
          <select
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950"
            value={organizationId}
            onChange={(event) => {
              setMessage(null);
              setOrganizationId(event.target.value);
              window.location.href = `/settings/members?organization_id=${event.target.value}`;
            }}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-5 py-4 font-medium">User ID</th>
              <th className="px-5 py-4 font-medium">Role</th>
              <th className="px-5 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialMembers.length ? (
              initialMembers.map((member) => (
                <tr key={member.id} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-mono text-xs text-slate-700">
                    {formatUserId(member.user_id)}
                  </td>
                  <td className="px-5 py-4">
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      defaultValue={member.role}
                      disabled={isPending}
                      onChange={(event) =>
                        handleRoleChange(
                          member.id,
                          event.target.value as AppRole
                        )
                      }
                    >
                      {selectableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                      {!selectableRoles.includes(member.role) ? (
                        <option value={member.role}>{member.role}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                      disabled={isPending}
                      onClick={() => handleRemove(member.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="px-5 py-8 text-slate-500"
                  colSpan={3}
                >
                  No members found for this organization. Provision users in
                  Supabase Auth, then add `organization_members` rows if needed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-500">
        Role changes and removals are recorded in `audit_events` as{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">
          membership.role_change
        </code>{" "}
        and{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">
          membership.remove
        </code>
        . New users still require Supabase Auth account creation (email invites
        are a later phase).
      </p>
    </div>
  );
}
