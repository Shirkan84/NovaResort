-- Prevent regular users from changing account type after registration.
-- Future admin approval tools can update profile_type through authenticated admin accounts
-- or service-role server code, but user profile editing must keep the current account type.

create or replace function public.current_account_type()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.profile_type from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.profile_type = 'admin'
      and coalesce(p.account_status, 'active') = 'active'
  )
$$;

revoke all on function public.current_account_type() from public;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_account_type() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and profile_type = public.current_account_type()
  and coalesce(account_status, 'active') = 'active'
);

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());
