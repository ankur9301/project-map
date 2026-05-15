-- project_map :: 0007_commute_mode.sql
-- Store each user's preferred commute mode on their target settings.

begin;

alter table public.target_location
    add column if not exists commute_mode text not null default 'transit';

alter table public.target_location
    drop constraint if exists target_location_commute_mode_check;

alter table public.target_location
    add constraint target_location_commute_mode_check
    check (commute_mode in ('transit', 'car', 'cycling', 'walking'));

commit;
