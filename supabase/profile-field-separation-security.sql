-- Separate regular member profile fields from approved healer-only fields.
-- Run in Supabase SQL Editor after the existing Nova Resort schema files.

alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists birth_date_visibility text not null default 'private';
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists personal_website text;
alter table public.profiles add column if not exists professional_website text;
alter table public.profiles add column if not exists linkedin_url text;
alter table public.profiles add column if not exists discoverable boolean not null default true;

alter table public.profiles drop constraint if exists profiles_birth_date_visibility_check;
alter table public.profiles add constraint profiles_birth_date_visibility_check
check (birth_date_visibility in ('private','age_range','birthday_only'));

alter table public.profiles drop constraint if exists profiles_birth_date_not_future_check;
alter table public.profiles add constraint profiles_birth_date_not_future_check
check (birth_date is null or birth_date <= current_date);

create or replace function public.profile_is_approved_professional(
  profile_type text,
  verification_status text,
  account_status text default 'active'
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(account_status,'active') = 'active'
    and verification_status = 'approved'
    and profile_type in ('healer','therapist','coach','mindfulness_teacher','wellness_professional','admin')
$$;

revoke all on function public.profile_is_approved_professional(text,text,text) from public;
grant execute on function public.profile_is_approved_professional(text,text,text) to authenticated;

create or replace function public.prevent_unauthorized_profile_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_is_admin() then
    return new;
  end if;

  if (select auth.uid()) is null or new.id <> (select auth.uid()) then
    raise exception 'Only the profile owner can update this profile.';
  end if;

  if new.profile_type is distinct from old.profile_type
    or new.professional_verification_status is distinct from old.professional_verification_status
    or coalesce(new.account_status,'active') is distinct from coalesce(old.account_status,'active') then
    raise exception 'Account type and verification status require administrator approval.';
  end if;

  if not public.profile_is_approved_professional(old.profile_type, old.professional_verification_status, old.account_status)
    and (
      new.professional_title is distinct from old.professional_title
      or coalesce(new.specialties,'{}'::text[]) is distinct from coalesce(old.specialties,'{}'::text[])
      or new.years_experience is distinct from old.years_experience
      or new.availability is distinct from old.availability
      or new.professional_website is distinct from old.professional_website
      or new.linkedin_url is distinct from old.linkedin_url
    ) then
    raise exception 'Healer professional profile fields are only editable after administrator approval.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_field_separation on public.profiles;
create trigger protect_profile_field_separation
before update on public.profiles
for each row execute function public.prevent_unauthorized_profile_field_changes();

revoke all on function public.prevent_unauthorized_profile_field_changes() from public;
revoke all on function public.prevent_unauthorized_profile_field_changes() from anon;
revoke all on function public.prevent_unauthorized_profile_field_changes() from authenticated;

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and profile_type = public.current_account_type()
  and professional_verification_status = public.current_verification_status()
  and coalesce(account_status, 'active') = 'active'
);
