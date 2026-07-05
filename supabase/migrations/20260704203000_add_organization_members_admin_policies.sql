-- Phase 2 Task 2.6: allow org admins and super_admin to manage memberships.

create policy "Org admins can read organization memberships"
on public.organization_members for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_org(organization_id)
  or public.is_super_admin()
);

create policy "Org admins can update organization memberships"
on public.organization_members for update
to authenticated
using (
  public.can_manage_org(organization_id)
  or public.is_super_admin()
)
with check (
  public.can_manage_org(organization_id)
  or public.is_super_admin()
);

create policy "Org admins can delete organization memberships"
on public.organization_members for delete
to authenticated
using (
  public.can_manage_org(organization_id)
  or public.is_super_admin()
);

create policy "Super admins can read organizations"
on public.organizations for select
to authenticated
using (public.is_super_admin());
