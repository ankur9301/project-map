-- =============================================================================
-- project_map :: 0001_decision_intelligence.sql
-- Rebuilds the schema for the v2 apartment decision-intelligence platform.
-- Run this in the Supabase SQL Editor.  This DROPs and re-creates the legacy
-- tables — back up any apartments.db / Supabase data you want to keep first.
-- =============================================================================

begin;

-- ---- Extensions ---------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---- Drop legacy v1 tables ---------------------------------------------
drop table if exists public.commutes cascade;
drop table if exists public.places_cache cascade;
drop table if exists public.geocode_cache cascade;
drop table if exists public.target_location cascade;
drop table if exists public.apartments cascade;

-- =============================================================================
-- apartments  ::  one row per saved listing, owned by an auth.users.id
-- =============================================================================
create table public.apartments (
    id              bigserial primary key,
    user_id         uuid        not null references auth.users(id) on delete cascade,

    -- listing identity
    address             text        not null,
    listing_url         text,
    image_url           text,
    source              text,                       -- e.g. 'zillow', 'streeteasy', 'extension'

    -- basics
    price               numeric(10,2),
    beds                numeric(3,1),
    baths               numeric(3,1),
    sqft                integer,

    -- building amenities (booleans the user toggles or extension scrapes)
    building_has_gym    boolean     not null default false,
    pet_friendly        boolean     not null default false,

    -- geo
    latitude            double precision,
    longitude           double precision,
    neighborhood_name   text,

    -- commute snapshots (denormalized for fast sort/filter; full detail in commutes table)
    commute_minutes_morning  integer,
    commute_minutes_evening  integer,

    -- score columns (0-10, except overall_score which is 0-100)
    commute_score           numeric(4,1),
    grocery_score           numeric(4,1),
    gym_score               numeric(4,1),
    nightlife_score         numeric(4,1),
    quietness_score         numeric(4,1),
    walkability_score       numeric(4,1),
    lifestyle_score         numeric(4,1),
    daily_friction_score    numeric(4,1),
    overall_score           numeric(5,1),

    -- audit trail for score transparency: weights, sub-metrics, POI counts
    score_breakdown   jsonb       not null default '{}'::jsonb,
    poi_snapshot      jsonb       not null default '{}'::jsonb,

    -- user-authored
    notes               text,
    vibe                text,
    favorite            boolean     not null default false,

    -- listing agent (optional)
    agent_name          text,
    agent_phone         text,
    agent_broker        text,

    -- timestamps
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint uq_apartment_user_address unique (user_id, address)
);

create index apartments_user_id_idx      on public.apartments (user_id);
create index apartments_overall_score_idx on public.apartments (overall_score desc nulls last);
create index apartments_favorite_idx     on public.apartments (user_id, favorite);

-- ---- updated_at trigger ----
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger apartments_set_updated_at
    before update on public.apartments
    for each row execute function public.set_updated_at();

-- =============================================================================
-- commutes  ::  per-direction commute detail, joined to apartments
-- =============================================================================
create table public.commutes (
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
    updated_at          timestamptz not null default now(),

    constraint uq_commute_apartment_direction unique (apartment_id, direction)
);

create index commutes_apartment_id_idx on public.commutes (apartment_id);

create trigger commutes_set_updated_at
    before update on public.commutes
    for each row execute function public.set_updated_at();

-- =============================================================================
-- target_location  ::  per-user office/destination for commute calculations
-- =============================================================================
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

-- =============================================================================
-- geocode_cache  ::  global lat/lon cache keyed on normalized address
-- =============================================================================
create table public.geocode_cache (
    id              bigserial primary key,
    address         text        not null unique,
    latitude        double precision not null,
    longitude       double precision not null,
    display_name    text,
    created_at      timestamptz not null default now()
);

create index geocode_cache_address_idx on public.geocode_cache (address);

-- =============================================================================
-- places_cache  ::  cached Places API nearby-search results
-- Keyed by quantized (lat,lon) bucket + category.  TTL handled in application.
-- =============================================================================
create table public.places_cache (
    id              bigserial primary key,
    lat_bucket      double precision not null,    -- rounded to ~3 decimals (~110m)
    lon_bucket      double precision not null,
    category        text        not null,         -- gym | grocery_store | cafe | restaurant | park | subway_station
    radius_m        integer     not null,
    payload         jsonb       not null,         -- raw normalized results: [{name, distance_m, rating, place_id, ...}]
    created_at      timestamptz not null default now(),

    constraint uq_places_cache_bucket_category unique (lat_bucket, lon_bucket, category, radius_m)
);

create index places_cache_lookup_idx on public.places_cache (lat_bucket, lon_bucket, category);

-- =============================================================================
-- Row Level Security
--   Frontend connects with the anon key + the user's JWT, so apartments.* must
--   filter on auth.uid() = user_id.  The FastAPI backend connects with the
--   Postgres role directly (or service_role) and bypasses RLS.
-- =============================================================================
alter table public.apartments      enable row level security;
alter table public.commutes        enable row level security;
alter table public.target_location enable row level security;
-- geocode_cache and places_cache are backend-only — leave RLS off.

create policy "apartments_own_select"
    on public.apartments for select
    using (auth.uid() = user_id);

create policy "apartments_own_insert"
    on public.apartments for insert
    with check (auth.uid() = user_id);

create policy "apartments_own_update"
    on public.apartments for update
    using (auth.uid() = user_id);

create policy "apartments_own_delete"
    on public.apartments for delete
    using (auth.uid() = user_id);

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

-- =============================================================================
-- Realtime publication — let the frontend subscribe to apartments + commutes
-- =============================================================================
alter publication supabase_realtime add table public.apartments;
alter publication supabase_realtime add table public.commutes;

commit;
