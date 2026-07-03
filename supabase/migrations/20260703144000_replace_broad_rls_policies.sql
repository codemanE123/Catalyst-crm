create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role = 'super_admin'
  );
$$;

create or replace function public.has_org_access(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.organization_id = org_id
    );
$$;

create or replace function public.can_write_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.organization_id = org_id
        and om.role in ('admin', 'sales')
    );
$$;

create or replace function public.can_manage_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.organization_id = org_id
        and om.role = 'admin'
    );
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.has_org_access(uuid) from public;
revoke all on function public.can_write_org(uuid) from public;
revoke all on function public.can_manage_org(uuid) from public;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_org_access(uuid) to authenticated;
grant execute on function public.can_write_org(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;

drop policy if exists "Authenticated users can read schools" on public.schools;
drop policy if exists "Authenticated users can manage schools" on public.schools;
drop policy if exists "Authenticated users can read contacts" on public.contacts;
drop policy if exists "Authenticated users can manage contacts" on public.contacts;
drop policy if exists "Authenticated users can read outreach" on public.outreach;
drop policy if exists "Authenticated users can manage outreach" on public.outreach;
drop policy if exists "Authenticated users can read interviews" on public.interviews;
drop policy if exists "Authenticated users can manage interviews" on public.interviews;
drop policy if exists "Authenticated users can read follow ups" on public.follow_ups;
drop policy if exists "Authenticated users can manage follow ups" on public.follow_ups;

create policy "Org members can read schools"
on public.schools for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Writers can insert schools"
on public.schools for insert
to authenticated
with check (public.can_write_org(organization_id));

create policy "Writers can update schools"
on public.schools for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

create policy "Admins can delete schools"
on public.schools for delete
to authenticated
using (public.can_manage_org(organization_id));

create policy "Org members can read contacts"
on public.contacts for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Writers can insert contacts"
on public.contacts for insert
to authenticated
with check (public.can_write_org(organization_id));

create policy "Writers can update contacts"
on public.contacts for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

create policy "Admins can delete contacts"
on public.contacts for delete
to authenticated
using (public.can_manage_org(organization_id));

create policy "Org members can read outreach"
on public.outreach for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Writers can insert outreach"
on public.outreach for insert
to authenticated
with check (public.can_write_org(organization_id));

create policy "Writers can update outreach"
on public.outreach for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

create policy "Admins can delete outreach"
on public.outreach for delete
to authenticated
using (public.can_manage_org(organization_id));

create policy "Org members can read interviews"
on public.interviews for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Writers can insert interviews"
on public.interviews for insert
to authenticated
with check (public.can_write_org(organization_id));

create policy "Writers can update interviews"
on public.interviews for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

create policy "Admins can delete interviews"
on public.interviews for delete
to authenticated
using (public.can_manage_org(organization_id));

create policy "Org members can read follow ups"
on public.follow_ups for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Writers can insert follow ups"
on public.follow_ups for insert
to authenticated
with check (public.can_write_org(organization_id));

create policy "Writers can update follow ups"
on public.follow_ups for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

create policy "Admins can delete follow ups"
on public.follow_ups for delete
to authenticated
using (public.can_manage_org(organization_id));
