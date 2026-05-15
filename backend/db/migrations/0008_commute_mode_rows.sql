-- project_map :: 0008_commute_mode_rows.sql
-- Store commute snapshots by transport mode + direction.

begin;

alter table public.commutes
    add column if not exists mode text not null default 'transit';

update public.commutes
set mode = 'transit'
where mode is null;

alter table public.commutes
    drop constraint if exists uq_commute_apartment_direction;

alter table public.commutes
    drop constraint if exists uq_commute_apartment_direction_mode;

alter table public.commutes
    add constraint uq_commute_apartment_direction_mode
    unique (apartment_id, direction, mode);

alter table public.commutes
    drop constraint if exists commutes_mode_check;

alter table public.commutes
    add constraint commutes_mode_check
    check (mode in ('transit', 'car', 'cycling', 'walking'));

commit;
