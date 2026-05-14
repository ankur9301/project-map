-- =============================================================================
-- project_map :: 0002_repair_existing_v1_to_v2.sql
--
-- Use this if your Supabase database already has old v1 tables and the backend
-- logs errors like:
--   column apartments.image_url does not exist
--   operator does not exist: character varying = uuid
--
-- This is a repair/upgrade script for the current v2 app code. It keeps rows
-- that already have a valid auth UUID user_id and removes legacy "local" rows
-- that cannot belong to a Supabase Auth user.
-- =============================================================================

begin;

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------- 
-- Shared updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ----------------------------------------------------------------------------- 
-- apartments: convert old v1 table into the v2 decision-intelligence shape
-- -----------------------------------------------------------------------------
alter table public.apartments add column if not exists user_id text default 'local';

delete from public.apartments
where user_id is null
   or user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.apartments
    alter column user_id drop default,
    alter column user_id type uuid using user_id::uuid,
    alter column user_id set not null;

alter table public.apartments
    add column if not exists listing_url text,
    add column if not exists image_url text,
    add column if not exists source text,
    add column if not exists price numeric(10,2),
    add column if not exists beds numeric(3,1),
    add column if not exists baths numeric(3,1),
    add column if not exists sqft integer,
    add column if not exists building_has_gym boolean not null default false,
    add column if not exists pet_friendly boolean not null default false,
    add column if not exists latitude double precision,
    add column if not exists longitude double precision,
    add column if not exists neighborhood_name text,
    add column if not exists commute_minutes_morning integer,
    add column if not exists commute_minutes_evening integer,
    add column if not exists commute_score numeric(4,1),
    add column if not exists grocery_score numeric(4,1),
    add column if not exists gym_score numeric(4,1),
    add column if not exists nightlife_score numeric(4,1),
    add column if not exists quietness_score numeric(4,1),
    add column if not exists walkability_score numeric(4,1),
    add column if not exists lifestyle_score numeric(4,1),
    add column if not exists daily_friction_score numeric(4,1),
    add column if not exists overall_score numeric(5,1),
    add column if not exists score_breakdown jsonb not null default '{}'::jsonb,
    add column if not exists poi_snapshot jsonb not null default '{}'::jsonb,
    add column if not exists notes text,
    add column if not exists vibe text,
    add column if not exists favorite boolean not null default false,
    add column if not exists agent_name text,
    add column if not exists agent_phone text,
    add column if not exists agent_broker text,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'apartments' and column_name = 'bed'
    ) then
        update public.apartments set beds = coalesce(beds, bed::numeric);
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'apartments' and column_name = 'bath'
    ) then
        update public.apartments set baths = coalesce(baths, bath::numeric);
    end if;
end $$;

drop trigger if exists apartments_set_updated_at on public.apartments;
create trigger apartments_set_updated_at
    before update on public.apartments
    for each row execute function public.set_updated_at();

create unique index if not exists uq_apartment_user_address
    on public.apartments (user_id, address);
create index if not exists apartments_user_id_idx on public.apartments (user_id);
create index if not exists apartments_overall_score_idx on public.apartments (overall_score desc nulls last);
create index if not exists apartments_favorite_idx on public.apartments (user_id, favorite);

-- ----------------------------------------------------------------------------- 
-- commutes
-- -----------------------------------------------------------------------------
create table if not exists public.commutes (
    id                  bigserial primary key,
    apartment_id        bigint      not null references public.apartments(id) on delete cascade,
    direction           text        not null check (direction in ('morning', 'evening')),
    total_minutes       integer,
    total_distance_km   double precision,
    transfers           integer,
    walking_minutes     integer,
    lines               text,
    estimated_arrival   text,
    route_summary       text,
    raw_error           text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

alter table public.commutes
    add column if not exists total_distance_km double precision,
    add column if not exists raw_error text,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_commute_apartment_direction
    on public.commutes (apartment_id, direction);
create index if not exists commutes_apartment_id_idx on public.commutes (apartment_id);

drop trigger if exists commutes_set_updated_at on public.commutes;
create trigger commutes_set_updated_at
    before update on public.commutes
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------- 
-- target_location: easiest safe repair is to rebuild it. The backend recreates
-- each user's target automatically the first time /target is called.
-- -----------------------------------------------------------------------------
drop table if exists public.target_location cascade;
create table public.target_location (
    id          bigserial primary key,
    user_id     uuid        not null references auth.users(id) on delete cascade unique,
    label       text        not null default 'Office',
    address     text        not null,
    latitude    double precision not null,
    longitude   double precision not null,
    updated_at  timestamptz not null default now()
);

create trigger target_location_set_updated_at
    before update on public.target_location
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------- 
-- caches
-- -----------------------------------------------------------------------------
create table if not exists public.geocode_cache (
    id              bigserial primary key,
    address         text        not null unique,
    latitude        double precision not null,
    longitude       double precision not null,
    display_name    text,
    created_at      timestamptz not null default now()
);

create table if not exists public.places_cache (
    id              bigserial primary key,
    lat_bucket      double precision not null,
    lon_bucket      double precision not null,
    category        text        not null,
    radius_m        integer     not null,
    payload         jsonb       not null,
    created_at      timestamptz not null default now()
);

create unique index if not exists uq_places_cache_bucket_category
    on public.places_cache (lat_bucket, lon_bucket, category, radius_m);

-- ----------------------------------------------------------------------------- 
-- RLS + Realtime
-- -----------------------------------------------------------------------------
alter table public.apartments      enable row level security;
alter table public.commutes        enable row level security;
alter table public.target_location enable row level security;

drop policy if exists "apartments_own_select" on public.apartments;
drop policy if exists "apartments_own_insert" on public.apartments;
drop policy if exists "apartments_own_update" on public.apartments;
drop policy if exists "apartments_own_delete" on public.apartments;
drop policy if exists "commutes_own_select" on public.commutes;
drop policy if exists "target_location_own_all" on public.target_location;

create policy "apartments_own_select" on public.apartments for select using (auth.uid() = user_id);
create policy "apartments_own_insert" on public.apartments for insert with check (auth.uid() = user_id);
create policy "apartments_own_update" on public.apartments for update using (auth.uid() = user_id);
create policy "apartments_own_delete" on public.apartments for delete using (auth.uid() = user_id);

create policy "commutes_own_select"
    on public.commutes for select
    using (
        exists (
            select 1 from public.apartments a
            where a.id = commutes.apartment_id and a.user_id = auth.uid()
        )
    );

create policy "target_location_own_all"
    on public.target_location for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

do $$
begin
    alter publication supabase_realtime add table public.apartments;
exception
    when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.commutes;
exception
    when duplicate_object then null;
end $$;

commit;
