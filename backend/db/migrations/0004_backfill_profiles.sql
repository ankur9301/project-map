-- =============================================================================
-- project_map :: 0004_backfill_profiles.sql
-- Backfill profile rows for users who existed BEFORE migration 0003.
-- The on_auth_user_created trigger only fires for new inserts, so anyone who
-- signed up under the old self-signup flow has no public.profiles row and
-- gets stuck on the "Awaiting approval" gate.
--
-- Run in Supabase SQL Editor.
-- =============================================================================

begin;

-- ---- 1. Create profile rows for every existing auth.users row -------------
insert into public.profiles (id, email, full_name, is_approved, approved_at)
select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', null),
    false,        -- default: not approved. We approve a curated list below.
    null
from auth.users u
where not exists (
    select 1 from public.profiles p where p.id = u.id
);

-- ---- 2. Approve specific pre-existing users by email ---------------------
-- Edit this list. Anyone here gets immediate access. Everyone else stays on
-- the "Awaiting approval" gate until you flip them manually or rebuild their
-- profile after re-invite.
update public.profiles
   set is_approved = true,
       approved_at = now()
 where email in (
    'ankurgyawali1250@gmail.com'
    -- , 'someone-else-you-trust@example.com'
 );

-- ---- 3. Sanity check ------------------------------------------------------
-- After running, eyeball the results in a second query:
--
--   select email, is_approved, approved_at from public.profiles order by created_at;
--
-- You should see your row with is_approved = true and everyone else false.

commit;
