-- Store structured parse output for meeting imports (HITL before Accept)

alter table public.meeting_imports
  add column if not exists parsed_json jsonb;

alter table public.meeting_imports
  add column if not exists parsed_at timestamptz;

alter table public.meeting_imports
  add column if not exists parsed_by uuid references auth.users(id) on delete set null;

alter table public.meeting_imports
  add column if not exists parse_method text;

alter table public.meeting_imports
  drop constraint if exists meeting_imports_parse_method_check;

alter table public.meeting_imports
  add constraint meeting_imports_parse_method_check
    check (
      parse_method is null
      or parse_method in ('heuristic', 'llm')
    );
