-- project_map :: 0006_admin_allowlist.sql
-- Admin allowlist flow without invite emails.
--
-- How to allow a friend:
--   insert into public.allowed_users (email, note)
--   values ('friend@example.com', 'friend from work')
--   on conflict (email) do update set is_active = true, note = excluded.note;

begin;

create table if not exists public.allowed_users (
    email text primary key,
    note text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

-- No public policies. Admin manages this table in the Supabase dashboard.

create or replace function public.email_is_allowed(email_value text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.allowed_users
         where lower(email) = lower(email_value)
           and is_active = true
    );
$$;

insert into public.allowed_users (email, note)
select lower(email), 'existing approved profile'
  from public.profiles
 where is_approved = true
   and email is not null
on conflict (email) do update set is_active = true;

update public.profiles
   set is_approved = public.email_is_allowed(email),
       approved_at = case when public.email_is_allowed(email) then coalesce(approved_at, now()) else approved_at end;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    allowed boolean;
begin
    allowed := public.email_is_allowed(new.email);
    insert into public.profiles (id, email, full_name, is_approved, approved_at)
    values (
        new.id,
        lower(new.email),
        coalesce(new.raw_user_meta_data->>'full_name', null),
        allowed,
        case when allowed then now() else null end
    )
    on conflict (id) do update
       set email = excluded.email,
           full_name = coalesce(public.profiles.full_name, excluded.full_name),
           is_approved = excluded.is_approved,
           approved_at = case when excluded.is_approved then coalesce(public.profiles.approved_at, now()) else public.profiles.approved_at end;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

commit;
