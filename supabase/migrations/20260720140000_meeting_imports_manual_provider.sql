-- Allow manual paste imports alongside Fireflies

alter table public.meeting_imports
  drop constraint if exists meeting_imports_provider_check;

alter table public.meeting_imports
  add constraint meeting_imports_provider_check
    check (provider in ('fireflies', 'manual'));
