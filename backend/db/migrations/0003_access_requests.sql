-- =============================================================================
-- project_map :: 0003_access_requests.sql
-- Invite-only access. Strangers submit an access request; admin (Ankur)
-- approves them via the backend endpoint, which invites them via Supabase Auth.
-- Run this in the Supabase SQL Editor.
-- =============================================================================

begin;

-- ---- enum: request_status ----------------------------------------------------
do $$ begin
    create type public.request_status as enum ('pending', 'approved', 'rejected');
exception
    when duplicate_object then null;
end $$;

-- ---- table: access_requests --------------------------------------------------
-- Stores anyone who wants in. Public (anon) can INSERT, that's it.
create table if not exists public.access_requests (
    id              bigserial   primary key,
    email           text        not null,
    full_name       text,
    reason          text,                                   -- "why I want in"
    status          public.request_status not null default 'pending',
    invited_user_id uuid        references auth.users(id),  -- set after invite
    notes           text,                                   -- admin-only notes
    created_at      timestamptz not null default now(),
    reviewed_at     timestamptz,
    constraint access_requests_email_unique unique (email)  -- one pending per email
);

create index if not exists access_requests_status_idx on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;

-- Public INSERT only. Email must look like an email, reason capped at 1000 chars
-- so the form can't be used to spam-storage.
drop policy if exists "anon can insert access requests" on public.access_requests;
create policy "anon can insert access requests"
    on public.access_requests
    for insert
    to anon, authenticated
    with check (
        email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        and char_length(coalesce(reason, '')) <= 1000
        and char_length(coalesce(full_name, '')) <= 200
    );

-- No SELECT / UPDATE / DELETE policies for anon or authenticated.
-- Admin work happens through the service role, which bypasses RLS.

-- ---- table: profiles --------------------------------------------------------
-- One row per auth.users row. is_approved gates everything downstream.
create table if not exists public.profiles (
    id              uuid        primary key references auth.users(id) on delete cascade,
    email           text,
    full_name       text,
    is_approved     boolean     not null default false,
    approved_at     timestamptz,
    created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "user reads own profile" on public.profiles;
create policy "user reads own profile"
    on public.profiles
    for select
    to authenticated
    using (id = auth.uid());

-- No insert/update from clients. Profiles are managed by the trigger below
-- (on signup) and by the backend approval endpoint (flips is_approved).

-- ---- trigger: bootstrap a profile row when a Supabase auth.users row appears
-- This runs for every new user (even ones created via admin invite). It does
-- NOT auto-approve them. The backend approval endpoint flips is_approved=true.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', null)
    )
    on conflict (id) do nothing;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- ---- lock the data tables behind is_approved --------------------------------
-- Apartments and target_location already exist from 0001. Their existing RLS
-- (user_id = auth.uid()) is correct but doesn't gate on approval. Add an
-- approval check so a created-but-not-approved auth user still sees nothing.
-- We do this by wrapping existing policies in an is_approved() predicate.

create or replace function public.is_approved(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select is_approved from public.profiles where id = user_id),
        false
    );
$$;

-- Apartments: replace policies so they require approval as well as ownership.
do $$ begin
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'apartments') then
        -- Drop any existing apartments policies idempotently.
        execute (
            select coalesce(string_agg(format('drop policy if exists %I on public.apartments;', polname), ' '), '')
            from pg_policy where polrelid = 'public.apartments'::regclass
        );

        execute $pol$
            create policy "approved user reads own apartments"
                on public.apartments for select to authenticated
                using (user_id = auth.uid() and public.is_approved(auth.uid()));
        $pol$;
        execute $pol$
            create policy "approved user writes own apartments"
                on public.apartments for all to authenticated
                using (user_id = auth.uid() and public.is_approved(auth.uid()))
                with check (user_id = auth.uid() and public.is_approved(auth.uid()));
        $pol$;
    end if;
end $$;

-- Target location: same pattern.
do $$ begin
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'target_location') then
        execute (
            select coalesce(string_agg(format('drop policy if exists %I on public.target_location;', polname), ' '), '')
            from pg_policy where polrelid = 'public.target_location'::regclass
        );
        execute $pol$
            create policy "approved user reads own target"
                on public.target_location for select to authenticated
                using (user_id = auth.uid() and public.is_approved(auth.uid()));
        $pol$;
        execute $pol$
            create policy "approved user writes own target"
                on public.target_location for all to authenticated
                using (user_id = auth.uid() and public.is_approved(auth.uid()))
                with check (user_id = auth.uid() and public.is_approved(auth.uid()));
        $pol$;
    end if;
end $$;

commit;

-- =============================================================================
-- After running this migration, also do the following in the Supabase dashboard
-- to actually lock signups down:
--
--   1) Authentication -> Providers -> Email
--        Enable email provider:          ON
--        Confirm email:                  ON
--        Allow new users to sign up:     OFF   <-- this is the kill switch
--
--      With "Allow new users to sign up" OFF, supabase.auth.signUp() from the
--      anon key will fail. The ONLY way a new auth.users row appears is when
--      the backend (using the service-role key) calls inviteUserByEmail().
--
--   2) Authentication -> URL Configuration
--        Site URL:                       https://ankur9301.github.io
--        Additional redirect URLs:       http://localhost:5173, https://ankur9301.github.io
--
--   3) (Optional but recommended) Authentication -> Rate Limits
--        Lower the public anon insert limit if you're worried about form spam.
-- =============================================================================
