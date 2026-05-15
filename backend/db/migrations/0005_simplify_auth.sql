-- project_map :: 0005_simplify_auth.sql
-- Self-serve auth: every signed-in user can use their own workspace.

begin;

update public.profiles
   set is_approved = true,
       approved_at = coalesce(approved_at, now());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, is_approved, approved_at)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', null),
        true,
        now()
    )
    on conflict (id) do update
       set email = excluded.email,
           full_name = coalesce(public.profiles.full_name, excluded.full_name),
           is_approved = true,
           approved_at = coalesce(public.profiles.approved_at, now());
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

do $$ begin
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'apartments') then
        execute (
            select coalesce(string_agg(format('drop policy if exists %I on public.apartments;', polname), ' '), '')
            from pg_policy where polrelid = 'public.apartments'::regclass
        );
        execute $pol$
            create policy "user reads own apartments"
                on public.apartments for select to authenticated
                using (user_id = auth.uid());
        $pol$;
        execute $pol$
            create policy "user writes own apartments"
                on public.apartments for all to authenticated
                using (user_id = auth.uid())
                with check (user_id = auth.uid());
        $pol$;
    end if;
end $$;

do $$ begin
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'target_location') then
        execute (
            select coalesce(string_agg(format('drop policy if exists %I on public.target_location;', polname), ' '), '')
            from pg_policy where polrelid = 'public.target_location'::regclass
        );
        execute $pol$
            create policy "user reads own target"
                on public.target_location for select to authenticated
                using (user_id = auth.uid());
        $pol$;
        execute $pol$
            create policy "user writes own target"
                on public.target_location for all to authenticated
                using (user_id = auth.uid())
                with check (user_id = auth.uid());
        $pol$;
    end if;
end $$;

commit;
