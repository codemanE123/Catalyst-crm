"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createMembershipInvite,
  revokeMembershipInvite,
  type MembershipInviteRow
} from "@/lib/actions/invites";
import {
  removeMember,
  updateMemberRole,
  type MembershipActionResult,
  type OrganizationMemberRow
} from "@/lib/actions/memberships";
import type { AppRole, Organization } from "@/lib/supabase";

const ROLE_OPTIONS: AppRole[] = ["read_only", "sales", "admin", "super_admin"];
const INVITE_ROLE_OPTIONS: AppRole[] = ["sales", "read_only", "admin"];

type MembersSettingsPanelProps = {
  organizations: Organization[];
  initialOrganizationId: string;
  initialMembers: OrganizationMemberRow[];
  initialInvites: MembershipInviteRow[];
  actorIsSuperAdmin: boolean;
};

function formatUserId(userId: string) {
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export default function MembersSettingsPanel({
  organizations,
  initialOrganizationId,
  initialMembers,
  initialInvites,
  actorIsSuperAdmin
}: MembersSettingsPanelProps) {
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<AppRole>("sales");
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

  function handleCreateInvite() {
    setMessage(null);
    setInviteUrl(null);
    startTransition(async () => {
      const result = await createMembershipInvite({
        organizationId,
        role: inviteRole,
        expiresInDays: 7,
        maxUses: 25
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(result.message);
      setInviteUrl(result.inviteUrl ?? null);
      router.refresh();
    });
  }

  function handleRevokeInvite(inviteId: string) {
    startTransition(async () => {
      const result = await revokeMembershipInvite({
        organizationId,
        inviteId
      });
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  const selectableRoles = actorIsSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((role) => role !== "super_admin");

  const activeInvites = initialInvites;

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
              setInviteUrl(null);
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

      {inviteUrl ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-medium">Copy this invite link now:</p>
          <p className="mt-2 break-all font-mono text-xs">{inviteUrl}</p>
          <button
            className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold"
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
            type="button"
          >
            Copy link
          </button>
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Invite link</h2>
        <p className="mt-1 text-sm text-slate-600">
          Share a link so teammates can create an account and join as{" "}
          <strong>sales</strong> (or another role). Links expire in 7 days and
          can be revoked.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Role
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              disabled={isPending}
              onChange={(event) =>
                setInviteRole(event.target.value as AppRole)
              }
              value={inviteRole}
            >
              {INVITE_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            disabled={isPending}
            onClick={handleCreateInvite}
            type="button"
          >
            Create invite link
          </button>
        </div>

        {activeInvites.length ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {activeInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <span>
                  {invite.role} · uses {invite.use_count}/{invite.max_uses} ·
                  expires{" "}
                  {new Date(invite.expires_at).toLocaleDateString()}
                </span>
                <button
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800"
                  disabled={isPending}
                  onClick={() => handleRevokeInvite(invite.id)}
                  type="button"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No active invite links.</p>
        )}
      </section>

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
                <td className="px-5 py-8 text-slate-500" colSpan={3}>
                  No members yet. Create an invite link above so teammates can
                  join.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
